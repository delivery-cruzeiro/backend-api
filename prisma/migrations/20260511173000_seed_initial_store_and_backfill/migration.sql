CREATE OR REPLACE FUNCTION calculate_store_business_hour_is_closed(
    p_open_time TIME,
    p_close_time TIME,
    p_reference TIMESTAMPTZ DEFAULT NOW()
)
RETURNS BOOLEAN AS $$
DECLARE
    current_local_time TIME;
BEGIN
    IF p_open_time IS NULL OR p_close_time IS NULL THEN
        RETURN TRUE;
    END IF;

    current_local_time := (p_reference AT TIME ZONE 'America/Sao_Paulo')::TIME;

    IF p_open_time = p_close_time THEN
        RETURN FALSE;
    END IF;

    IF p_close_time < p_open_time THEN
        RETURN NOT (current_local_time >= p_open_time OR current_local_time < p_close_time);
    END IF;

    RETURN NOT (current_local_time >= p_open_time AND current_local_time < p_close_time);
END;
$$ LANGUAGE plpgsql STABLE;

CREATE OR REPLACE FUNCTION is_store_closed(
    p_store_id UUID,
    p_reference TIMESTAMPTZ DEFAULT NOW()
)
RETURNS BOOLEAN AS $$
DECLARE
    local_date DATE;
    local_week_day SMALLINT;
    selected_hour RECORD;
    store_defaults RECORD;
    resolved_open_time TIME;
    resolved_close_time TIME;
BEGIN
    local_date := (p_reference AT TIME ZONE 'America/Sao_Paulo')::DATE;
    local_week_day := EXTRACT(DOW FROM (p_reference AT TIME ZONE 'America/Sao_Paulo'))::SMALLINT;

    SELECT *
    INTO selected_hour
    FROM "store_business_hours"
    WHERE "store_id" = p_store_id
      AND "date" = local_date
    LIMIT 1;

    IF NOT FOUND THEN
        SELECT *
        INTO selected_hour
        FROM "store_business_hours"
        WHERE "store_id" = p_store_id
          AND "week_day" = local_week_day
        LIMIT 1;
    END IF;

    SELECT "open_hour", "close_hour"
    INTO store_defaults
    FROM "stores"
    WHERE "id" = p_store_id;

    IF NOT FOUND THEN
        RETURN TRUE;
    END IF;

    IF selected_hour IS NULL THEN
        RETURN calculate_store_business_hour_is_closed(
            store_defaults."open_hour",
            store_defaults."close_hour",
            p_reference
        );
    END IF;

    IF selected_hour."is_closed" = TRUE THEN
        RETURN TRUE;
    END IF;

    resolved_open_time := COALESCE(selected_hour."open_time", store_defaults."open_hour");
    resolved_close_time := COALESCE(selected_hour."close_time", store_defaults."close_hour");

    RETURN calculate_store_business_hour_is_closed(
        resolved_open_time,
        resolved_close_time,
        p_reference
    );
END;
$$ LANGUAGE plpgsql STABLE;

CREATE OR REPLACE FUNCTION set_store_business_hour_is_closed()
RETURNS TRIGGER AS $$
DECLARE
    local_date DATE;
    local_week_day SMALLINT;
    store_defaults RECORD;
    resolved_open_time TIME;
    resolved_close_time TIME;
BEGIN
    local_date := (NOW() AT TIME ZONE 'America/Sao_Paulo')::DATE;
    local_week_day := EXTRACT(DOW FROM (NOW() AT TIME ZONE 'America/Sao_Paulo'))::SMALLINT;

    IF NEW."date" = local_date OR (NEW."date" IS NULL AND NEW."week_day" = local_week_day) THEN
        SELECT "open_hour", "close_hour"
        INTO store_defaults
        FROM "stores"
        WHERE "id" = NEW."store_id";

        resolved_open_time := COALESCE(NEW."open_time", store_defaults."open_hour");
        resolved_close_time := COALESCE(NEW."close_time", store_defaults."close_hour");
        NEW."is_closed" := calculate_store_business_hour_is_closed(
            resolved_open_time,
            resolved_close_time,
            NOW()
        );
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER set_store_business_hours_is_closed
BEFORE INSERT OR UPDATE OF "week_day", "date", "open_time", "close_time", "store_id"
ON "store_business_hours"
FOR EACH ROW EXECUTE FUNCTION set_store_business_hour_is_closed();

DO $$
DECLARE
    initial_store_id UUID;
    initial_store_address_id TEXT := 'initial_store_address_1';
    initial_store_owner_id TEXT;
BEGIN
    SELECT "id"
    INTO initial_store_owner_id
    FROM "User"
    WHERE "name" = 'admin'
      AND "role" IN ('ADMIN', 'SUPER_ADMIN', 'MANAGER')
    ORDER BY "createdAt" ASC, "id" ASC
    LIMIT 1;

    IF initial_store_owner_id IS NULL THEN
        RAISE EXCEPTION 'Nenhum usuario admin encontrado com name = admin para assumir a loja inicial';
    END IF;

    INSERT INTO "Address" (
        "id",
        "userId",
        "street",
        "number",
        "complement",
        "neighborhood",
        "city",
        "state",
        "zipCode",
        "isDefault",
        "createdAt",
        "updatedAt"
    )
    VALUES (
        initial_store_address_id,
        initial_store_owner_id,
        'Avenida Francisco Lopes de Almeida',
        '250',
        NULL,
        'Cruzeiro',
        'Campina Grande',
        'PB',
        '58417-290',
        FALSE,
        CURRENT_TIMESTAMP,
        CURRENT_TIMESTAMP
    );

    INSERT INTO "stores" (
        "name",
        "nickname",
        "is_active",
        "phone_number",
        "open_hour",
        "close_hour",
        "week_days_open",
        "address_id",
        "owner_id",
        "cnpj",
        "created_at",
        "updated_at"
    )
    VALUES (
        'loja 1',
        'Pastel do cruzeiro - Loja 1',
        TRUE,
        '83 3335 1491',
        TIME '17:00',
        TIME '01:00',
        '[0,1,2,3,4,5,6]'::JSONB,
        initial_store_address_id,
        initial_store_owner_id,
        '18.016.122/0001-31',
        CURRENT_TIMESTAMP,
        CURRENT_TIMESTAMP
    )
    RETURNING "id" INTO initial_store_id;

    INSERT INTO "store_business_hours" (
        "store_id",
        "week_day",
        "date",
        "open_time",
        "close_time",
        "is_closed",
        "created_at",
        "updated_at"
    )
    SELECT
        initial_store_id,
        week_day::SMALLINT,
        NULL,
        TIME '17:00',
        TIME '01:00',
        FALSE,
        CURRENT_TIMESTAMP,
        CURRENT_TIMESTAMP
    FROM generate_series(0, 6) AS week_day;

    INSERT INTO "_StoreMenus" ("A", "B")
    SELECT "id", initial_store_id
    FROM "Menu"
    ON CONFLICT DO NOTHING;

    INSERT INTO "_StoreCategories" ("A", "B")
    SELECT "id", initial_store_id
    FROM "Category"
    ON CONFLICT DO NOTHING;

    INSERT INTO "_StoreSubcategories" ("A", "B")
    SELECT initial_store_id, "id"
    FROM "Subcategory"
    ON CONFLICT DO NOTHING;

    INSERT INTO "_StoreProducts" ("A", "B")
    SELECT "id", initial_store_id
    FROM "Product"
    ON CONFLICT DO NOTHING;

    INSERT INTO "_StorePromotions" ("A", "B")
    SELECT "id", initial_store_id
    FROM "Promotion"
    ON CONFLICT DO NOTHING;

    INSERT INTO "_UserStores" ("A", "B")
    SELECT initial_store_id, "id"
    FROM "User"
    WHERE "role" <> 'CLIENT'
    ON CONFLICT DO NOTHING;

    UPDATE "Order"
    SET "store_id" = initial_store_id
    WHERE "store_id" IS NULL;
END $$;

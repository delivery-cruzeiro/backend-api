CREATE OR REPLACE FUNCTION is_store_closed(
    p_store_id UUID,
    p_reference TIMESTAMPTZ DEFAULT NOW()
)
RETURNS BOOLEAN AS $$
DECLARE
    local_date DATE;
    local_week_day SMALLINT;
    selected_hour RECORD;
    has_selected_hour BOOLEAN := FALSE;
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

    has_selected_hour := FOUND;

    IF NOT has_selected_hour THEN
        SELECT *
        INTO selected_hour
        FROM "store_business_hours"
        WHERE "store_id" = p_store_id
          AND "week_day" = local_week_day
        LIMIT 1;

        has_selected_hour := FOUND;
    END IF;

    SELECT "open_hour", "close_hour"
    INTO store_defaults
    FROM "stores"
    WHERE "id" = p_store_id;

    IF NOT FOUND THEN
        RETURN TRUE;
    END IF;

    IF NOT has_selected_hour THEN
        RETURN calculate_store_business_hour_is_closed(
            store_defaults."open_hour",
            store_defaults."close_hour",
            p_reference
        );
    END IF;

    IF selected_hour."is_closed" = TRUE
        AND selected_hour."open_time" IS NULL
        AND selected_hour."close_time" IS NULL THEN
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

BEGIN;
-- Managed PostgreSQL owners are not superusers. FORCE RLS must explicitly allow
-- the actual table owner to import reference data in the migration context.
-- Runtime grants remain SELECT-only, and delivery_app is never the table owner.
DO $$
DECLARE reference_table TEXT; owner_name TEXT;
BEGIN
  FOREACH reference_table IN ARRAY ARRAY['cnefe_datasets', 'cnefe_addresses'] LOOP
    SELECT pg_get_userbyid(c.relowner) INTO owner_name
      FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
      WHERE n.nspname='public' AND c.relname=reference_table;
    IF owner_name IS NULL OR owner_name='delivery_app' THEN
      RAISE EXCEPTION 'CNEFE reference tables require an administrative owner';
    END IF;
    EXECUTE format('CREATE POLICY administrative_reference_import ON %I FOR ALL TO %I
      USING (current_user = %L AND current_setting(''app.kind'', true) = ''system'')
      WITH CHECK (current_user = %L AND current_setting(''app.kind'', true) = ''system'')',
      reference_table, owner_name, owner_name, owner_name);
  END LOOP;
END $$;
COMMIT;

BEGIN;
-- Existing database defaults grant table privileges to delivery_app.
-- Explicitly remove writes (including TRUNCATE, which is not governed by RLS).
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
  ON cnefe_datasets, cnefe_addresses FROM delivery_app;
GRANT SELECT ON cnefe_datasets, cnefe_addresses TO delivery_app;
COMMIT;

BEGIN;
CREATE TABLE store_operation_settings (
  store_id UUID PRIMARY KEY REFERENCES stores(id) ON DELETE CASCADE,
  settings JSONB NOT NULL,
  updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
ALTER TABLE store_operation_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE store_operation_settings FORCE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON store_operation_settings TO delivery_app;
CREATE POLICY server_access ON store_operation_settings TO delivery_app USING (true) WITH CHECK (true);
ALTER TABLE "Order" ADD COLUMN scheduled_at TIMESTAMP(3), ADD COLUMN auto_accept_at TIMESTAMP(3);
CREATE INDEX "Order_status_autoAcceptAt_idx" ON "Order" (status, auto_accept_at);
COMMIT;

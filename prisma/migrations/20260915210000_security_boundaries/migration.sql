CREATE TABLE "LoginAttempt" (
 "key" TEXT PRIMARY KEY, "attempts" INTEGER NOT NULL DEFAULT 1, "expiresAt" TIMESTAMP(3) NOT NULL
);
CREATE INDEX "LoginAttempt_expiresAt_idx" ON "LoginAttempt"("expiresAt");

DO $$ BEGIN
 IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='delivery_app') THEN
  CREATE ROLE delivery_app NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
 END IF;
END $$;
GRANT USAGE ON SCHEMA public TO delivery_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO delivery_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO delivery_app;
REVOKE ALL ON "_prisma_migrations" FROM delivery_app;
REVOKE CREATE ON SCHEMA public FROM PUBLIC;

CREATE FUNCTION app_security_staff() RETURNS BOOLEAN LANGUAGE sql STABLE AS $$
 SELECT COALESCE(current_setting('app.kind', true) = 'system',false)
 OR COALESCE(current_setting('app.role',true) IN ('ADMIN','SUPER_ADMIN','MANAGER'),false)
$$;
CREATE FUNCTION app_security_user() RETURNS TEXT LANGUAGE sql STABLE AS $$
 SELECT COALESCE(current_setting('app.user_id',true),'')
$$;

-- Auth/catalog tables are server-only. Customer-owned tables below additionally
-- enforce ownership even when an application query omits its user filter.
DO $$ DECLARE t RECORD; BEGIN
 FOR t IN SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename <> '_prisma_migrations' LOOP
  EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY',t.tablename);
  EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY',t.tablename);
  EXECUTE format('CREATE POLICY server_access ON %I TO delivery_app USING (true) WITH CHECK (true)',t.tablename);
 END LOOP;
END $$;

DO $$ DECLARE t TEXT; BEGIN
 FOREACH t IN ARRAY ARRAY['Address','PaymentMethod','Order','Notification','Point','Review','Favorite'] LOOP
  EXECUTE format('DROP POLICY server_access ON %I',t);
  EXECUTE format('CREATE POLICY owner_access ON %I TO delivery_app USING (app_security_staff() OR "userId" = app_security_user()) WITH CHECK (app_security_staff() OR "userId" = app_security_user())',t);
 END LOOP;
END $$;
CREATE POLICY public_store_address ON "Address" FOR SELECT TO delivery_app
 USING (EXISTS (SELECT 1 FROM stores WHERE stores.address_id="Address".id AND stores.is_active));

DROP POLICY server_access ON "OrderItem";
CREATE POLICY order_owner ON "OrderItem" TO delivery_app
 USING (EXISTS (SELECT 1 FROM "Order" WHERE "Order".id="OrderItem"."orderId"))
 WITH CHECK (EXISTS (SELECT 1 FROM "Order" WHERE "Order".id="OrderItem"."orderId"));
DROP POLICY server_access ON "Payment";
CREATE POLICY order_owner ON "Payment" TO delivery_app
 USING (EXISTS (SELECT 1 FROM "Order" WHERE "Order".id="Payment"."orderId"))
 WITH CHECK (EXISTS (SELECT 1 FROM "Order" WHERE "Order".id="Payment"."orderId"));
DROP POLICY server_access ON fiscal_documents;
CREATE POLICY fiscal_staff ON fiscal_documents TO delivery_app
 USING (app_security_staff()) WITH CHECK (app_security_staff());

-- New tables also require explicit policies: grants do not bypass RLS.
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO delivery_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO delivery_app;

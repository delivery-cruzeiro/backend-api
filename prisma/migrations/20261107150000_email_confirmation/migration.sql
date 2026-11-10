CREATE TABLE "EmailConfirmation" (
  "userId" TEXT PRIMARY KEY REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "codeHash" TEXT UNIQUE,
  "emailHash" TEXT,
  "expiresAt" TIMESTAMP(3),
  "lastSentAt" TIMESTAMP(3),
  "previousSentAt" TIMESTAMP(3)
);

ALTER TABLE "EmailConfirmation" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "EmailConfirmation" FORCE ROW LEVEL SECURITY;
CREATE POLICY server_access ON "EmailConfirmation" TO delivery_app
  USING (current_setting('app.kind', true) = 'system')
  WITH CHECK (current_setting('app.kind', true) = 'system');
GRANT SELECT, INSERT, UPDATE, DELETE ON "EmailConfirmation" TO delivery_app;

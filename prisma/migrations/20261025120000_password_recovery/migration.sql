CREATE TABLE "PasswordRecovery" (
  "key" TEXT NOT NULL PRIMARY KEY,
  "userId" TEXT NOT NULL,
  "codeHash" TEXT,
  "authorizationHash" TEXT,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "lastSentAt" TIMESTAMP(3) NOT NULL
);
CREATE INDEX "PasswordRecovery_expiresAt_idx" ON "PasswordRecovery"("expiresAt");
ALTER TABLE "PasswordRecovery" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "PasswordRecovery" FORCE ROW LEVEL SECURITY;
CREATE POLICY server_access ON "PasswordRecovery" TO delivery_app USING (true) WITH CHECK (true);
GRANT SELECT, INSERT, UPDATE, DELETE ON "PasswordRecovery" TO delivery_app;

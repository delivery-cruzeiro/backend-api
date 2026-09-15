-- Reconcile the historical SQL migrations with the already-used Prisma auth model.
-- Existing databases already using these columns are left intact. Legacy fields
-- without a current equivalent are retained to avoid deleting authentication data.
BEGIN;
DO $$
DECLARE mapping RECORD;
BEGIN
  FOR mapping IN SELECT * FROM (VALUES
    ('Account','provider','providerId'),
    ('Account','providerAccountId','accountId'),
    ('Account','access_token','accessToken'),
    ('Account','refresh_token','refreshToken'),
    ('Account','id_token','idToken'),
    ('Session','sessionToken','token'),
    ('Session','expires','expiresAt')
  ) AS m(tbl, old_col, new_col) LOOP
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name=mapping.tbl AND column_name=mapping.old_col)
       AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name=mapping.tbl AND column_name=mapping.new_col) THEN
      EXECUTE format('ALTER TABLE %I RENAME COLUMN %I TO %I', mapping.tbl, mapping.old_col, mapping.new_col);
    END IF;
  END LOOP;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='User' AND column_name='emailVerified' AND data_type='timestamp without time zone') THEN
    ALTER TABLE "User" ALTER COLUMN "emailVerified" TYPE BOOLEAN USING ("emailVerified" IS NOT NULL);
    ALTER TABLE "User" ALTER COLUMN "emailVerified" SET DEFAULT false;
    ALTER TABLE "User" ALTER COLUMN "emailVerified" SET NOT NULL;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='Account' AND column_name='type') THEN
    ALTER TABLE "Account" ALTER COLUMN "type" DROP NOT NULL;
  END IF;
END $$;

ALTER TABLE "Account"
  ADD COLUMN IF NOT EXISTS "password" TEXT,
  ADD COLUMN IF NOT EXISTS "accessTokenExpiresAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "refreshTokenExpiresAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "Session"
  ADD COLUMN IF NOT EXISTS "ipAddress" TEXT,
  ADD COLUMN IF NOT EXISTS "userAgent" TEXT,
  ADD COLUMN IF NOT EXISTS "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='Account' AND column_name='expires_at') THEN
    UPDATE "Account" SET "accessTokenExpiresAt"=to_timestamp("expires_at") WHERE "accessTokenExpiresAt" IS NULL AND "expires_at" IS NOT NULL;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS "Verification" (
  "id" TEXT PRIMARY KEY NOT NULL,
  "identifier" TEXT NOT NULL,
  "value" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3)
);
CREATE UNIQUE INDEX IF NOT EXISTS "Category_name_key" ON "Category"("name");
CREATE UNIQUE INDEX IF NOT EXISTS "Session_token_key" ON "Session"("token");
ALTER TABLE "cup_poll_guesses" ALTER COLUMN "score_format" SET DEFAULT 'br-no';
COMMIT;

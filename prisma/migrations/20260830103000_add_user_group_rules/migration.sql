CREATE TYPE "UserGroupMode" AS ENUM ('MANUAL', 'RULE');

ALTER TABLE "user_groups"
	ADD COLUMN "mode" "UserGroupMode" NOT NULL DEFAULT 'MANUAL',
	ADD COLUMN "rules" JSONB NOT NULL DEFAULT '[]'::jsonb;

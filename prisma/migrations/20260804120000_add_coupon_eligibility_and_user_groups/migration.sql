CREATE TYPE "PromotionEligibilityType" AS ENUM ('ALL', 'GROUP', 'SINGLE_USER');

CREATE TYPE "PromotionUsageMode" AS ENUM ('USAGE_QUANTITY', 'AVAILABLE_PERIOD');

ALTER TABLE "Promotion"
	ADD COLUMN "eligibility_type" "PromotionEligibilityType" NOT NULL DEFAULT 'ALL',
	ADD COLUMN "eligibility_target" JSONB,
	ADD COLUMN "usage_mode" "PromotionUsageMode" NOT NULL DEFAULT 'AVAILABLE_PERIOD',
	ADD COLUMN "usage_limit" INTEGER;

ALTER TABLE "Order"
	ADD COLUMN "promotion_id" TEXT;

CREATE TABLE "user_groups" (
	"id" TEXT NOT NULL,
	"name" TEXT NOT NULL,
	"created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
	"updated_at" TIMESTAMP(3) NOT NULL,
	CONSTRAINT "user_groups_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "user_group_members" (
	"id" TEXT NOT NULL,
	"group_id" TEXT NOT NULL,
	"user_id" TEXT NOT NULL,
	"created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
	CONSTRAINT "user_group_members_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "user_groups_name_key" ON "user_groups"("name");
CREATE UNIQUE INDEX "user_group_members_group_id_user_id_key" ON "user_group_members"("group_id", "user_id");
CREATE INDEX "Order_promotion_id_idx" ON "Order"("promotion_id");
CREATE INDEX "Promotion_eligibility_type_idx" ON "Promotion"("eligibility_type");
CREATE INDEX "Promotion_usage_mode_idx" ON "Promotion"("usage_mode");
CREATE INDEX "user_group_members_group_id_idx" ON "user_group_members"("group_id");
CREATE INDEX "user_group_members_user_id_idx" ON "user_group_members"("user_id");

ALTER TABLE "Order"
	ADD CONSTRAINT "Order_promotion_id_fkey"
	FOREIGN KEY ("promotion_id") REFERENCES "Promotion"("id")
	ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "user_group_members"
	ADD CONSTRAINT "user_group_members_group_id_fkey"
	FOREIGN KEY ("group_id") REFERENCES "user_groups"("id")
	ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "user_group_members"
	ADD CONSTRAINT "user_group_members_user_id_fkey"
	FOREIGN KEY ("user_id") REFERENCES "User"("id")
	ON DELETE CASCADE ON UPDATE CASCADE;

CREATE OR REPLACE FUNCTION deactivate_expired_period_promotions()
RETURNS integer AS $$
DECLARE
	affected_rows integer;
BEGIN
	UPDATE "Promotion"
	SET "isActive" = false
	WHERE "usage_mode" = 'AVAILABLE_PERIOD'
		AND "isActive" = true
		AND "endDate"::date < CURRENT_DATE;

	GET DIAGNOSTICS affected_rows = ROW_COUNT;
	RETURN affected_rows;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION enforce_period_promotion_active_window()
RETURNS trigger AS $$
BEGIN
	IF NEW."usage_mode" = 'AVAILABLE_PERIOD'
		AND NEW."isActive" = true
		AND NEW."endDate"::date < CURRENT_DATE THEN
		RAISE EXCEPTION 'available period promotion cannot be active after endDate';
	END IF;

	RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER enforce_period_promotion_active_window_trigger
BEFORE INSERT OR UPDATE ON "Promotion"
FOR EACH ROW
EXECUTE FUNCTION enforce_period_promotion_active_window();

SELECT deactivate_expired_period_promotions();

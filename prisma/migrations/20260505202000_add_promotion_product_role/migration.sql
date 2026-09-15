CREATE TYPE "PromotionProductRole" AS ENUM ('TARGET', 'REWARD');

DROP INDEX IF EXISTS "PromotionProduct_promotionId_productId_key";

ALTER TABLE "PromotionProduct"
ADD COLUMN "role" "PromotionProductRole" NOT NULL DEFAULT 'TARGET';

CREATE UNIQUE INDEX "PromotionProduct_promotionId_productId_role_key"
ON "PromotionProduct"("promotionId", "productId", "role");

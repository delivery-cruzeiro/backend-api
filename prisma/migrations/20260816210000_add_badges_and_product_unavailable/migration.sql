-- AlterTable
ALTER TABLE "Product"
ADD COLUMN "unavailable" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "badges" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "color" TEXT NOT NULL,
    "icon" TEXT,
    "store_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "badges_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product_badges" (
    "id" TEXT NOT NULL,
    "product_id" TEXT NOT NULL,
    "badge_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "product_badges_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "badges_store_id_name_key" ON "badges"("store_id", "name");
CREATE INDEX "badges_store_id_is_active_idx" ON "badges"("store_id", "is_active");
CREATE UNIQUE INDEX "product_badges_product_id_badge_id_key" ON "product_badges"("product_id", "badge_id");
CREATE INDEX "product_badges_badge_id_idx" ON "product_badges"("badge_id");
CREATE INDEX "product_badges_product_id_idx" ON "product_badges"("product_id");

-- AddForeignKey
ALTER TABLE "badges"
ADD CONSTRAINT "badges_store_id_fkey"
FOREIGN KEY ("store_id") REFERENCES "stores"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_badges"
ADD CONSTRAINT "product_badges_product_id_fkey"
FOREIGN KEY ("product_id") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_badges"
ADD CONSTRAINT "product_badges_badge_id_fkey"
FOREIGN KEY ("badge_id") REFERENCES "badges"("id") ON DELETE CASCADE ON UPDATE CASCADE;

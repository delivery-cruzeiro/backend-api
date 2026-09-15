CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- CreateTable
CREATE TABLE "stores" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" TEXT NOT NULL,
    "nickname" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "phone_number" TEXT,
    "open_hour" TIME(0),
    "close_hour" TIME(0),
    "week_days_open" JSONB,
    "address_id" TEXT NOT NULL,
    "owner_id" TEXT NOT NULL,
    "cnpj" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "stores_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "store_business_hours" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "store_id" UUID NOT NULL,
    "week_day" SMALLINT,
    "date" DATE,
    "open_time" TIME(0),
    "close_time" TIME(0),
    "is_closed" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "store_business_hours_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "store_business_hours_week_day_or_date_check" CHECK (
        ("week_day" IS NOT NULL AND "date" IS NULL)
        OR
        ("week_day" IS NULL AND "date" IS NOT NULL)
    ),
    CONSTRAINT "store_business_hours_week_day_range_check" CHECK (
        "week_day" IS NULL OR ("week_day" BETWEEN 0 AND 6)
    )
);

-- AlterTable
ALTER TABLE "Order" ADD COLUMN "store_id" UUID;

-- CreateTable
CREATE TABLE "_StoreCategories" (
    "A" TEXT NOT NULL,
    "B" UUID NOT NULL,

    CONSTRAINT "_StoreCategories_AB_pkey" PRIMARY KEY ("A", "B")
);

-- CreateTable
CREATE TABLE "_StoreMenus" (
    "A" TEXT NOT NULL,
    "B" UUID NOT NULL,

    CONSTRAINT "_StoreMenus_AB_pkey" PRIMARY KEY ("A", "B")
);

-- CreateTable
CREATE TABLE "_StoreProducts" (
    "A" TEXT NOT NULL,
    "B" UUID NOT NULL,

    CONSTRAINT "_StoreProducts_AB_pkey" PRIMARY KEY ("A", "B")
);

-- CreateTable
CREATE TABLE "_StorePromotions" (
    "A" TEXT NOT NULL,
    "B" UUID NOT NULL,

    CONSTRAINT "_StorePromotions_AB_pkey" PRIMARY KEY ("A", "B")
);

-- CreateTable
CREATE TABLE "_StoreSubcategories" (
    "A" UUID NOT NULL,
    "B" TEXT NOT NULL,

    CONSTRAINT "_StoreSubcategories_AB_pkey" PRIMARY KEY ("A", "B")
);

-- CreateTable
CREATE TABLE "_UserStores" (
    "A" UUID NOT NULL,
    "B" TEXT NOT NULL,

    CONSTRAINT "_UserStores_AB_pkey" PRIMARY KEY ("A", "B")
);

-- CreateIndex
CREATE INDEX "stores_address_id_idx" ON "stores"("address_id");

-- CreateIndex
CREATE INDEX "stores_is_active_idx" ON "stores"("is_active");

-- CreateIndex
CREATE INDEX "stores_owner_id_idx" ON "stores"("owner_id");

-- CreateIndex
CREATE INDEX "store_business_hours_date_idx" ON "store_business_hours"("date");

-- CreateIndex
CREATE INDEX "store_business_hours_is_closed_idx" ON "store_business_hours"("is_closed");

-- CreateIndex
CREATE INDEX "store_business_hours_store_id_idx" ON "store_business_hours"("store_id");

-- CreateIndex
CREATE INDEX "store_business_hours_week_day_idx" ON "store_business_hours"("week_day");

-- CreateIndex
CREATE UNIQUE INDEX "store_business_hours_store_id_week_day_key" ON "store_business_hours"("store_id", "week_day")
WHERE "week_day" IS NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "store_business_hours_store_id_date_key" ON "store_business_hours"("store_id", "date")
WHERE "date" IS NOT NULL;

-- CreateIndex
CREATE INDEX "_StoreCategories_B_index" ON "_StoreCategories"("B");

-- CreateIndex
CREATE INDEX "_StoreMenus_B_index" ON "_StoreMenus"("B");

-- CreateIndex
CREATE INDEX "_StoreProducts_B_index" ON "_StoreProducts"("B");

-- CreateIndex
CREATE INDEX "_StorePromotions_B_index" ON "_StorePromotions"("B");

-- CreateIndex
CREATE INDEX "_StoreSubcategories_B_index" ON "_StoreSubcategories"("B");

-- CreateIndex
CREATE INDEX "_UserStores_B_index" ON "_UserStores"("B");

-- CreateIndex
CREATE INDEX "Order_store_id_idx" ON "Order"("store_id");

-- AddForeignKey
ALTER TABLE "stores" ADD CONSTRAINT "stores_address_id_fkey" FOREIGN KEY ("address_id") REFERENCES "Address"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stores" ADD CONSTRAINT "stores_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "store_business_hours" ADD CONSTRAINT "store_business_hours_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "stores"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "stores"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_StoreCategories" ADD CONSTRAINT "_StoreCategories_A_fkey" FOREIGN KEY ("A") REFERENCES "Category"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_StoreCategories" ADD CONSTRAINT "_StoreCategories_B_fkey" FOREIGN KEY ("B") REFERENCES "stores"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_StoreMenus" ADD CONSTRAINT "_StoreMenus_A_fkey" FOREIGN KEY ("A") REFERENCES "Menu"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_StoreMenus" ADD CONSTRAINT "_StoreMenus_B_fkey" FOREIGN KEY ("B") REFERENCES "stores"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_StoreProducts" ADD CONSTRAINT "_StoreProducts_A_fkey" FOREIGN KEY ("A") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_StoreProducts" ADD CONSTRAINT "_StoreProducts_B_fkey" FOREIGN KEY ("B") REFERENCES "stores"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_StorePromotions" ADD CONSTRAINT "_StorePromotions_A_fkey" FOREIGN KEY ("A") REFERENCES "Promotion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_StorePromotions" ADD CONSTRAINT "_StorePromotions_B_fkey" FOREIGN KEY ("B") REFERENCES "stores"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_StoreSubcategories" ADD CONSTRAINT "_StoreSubcategories_A_fkey" FOREIGN KEY ("A") REFERENCES "stores"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_StoreSubcategories" ADD CONSTRAINT "_StoreSubcategories_B_fkey" FOREIGN KEY ("B") REFERENCES "Subcategory"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_UserStores" ADD CONSTRAINT "_UserStores_A_fkey" FOREIGN KEY ("A") REFERENCES "stores"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_UserStores" ADD CONSTRAINT "_UserStores_B_fkey" FOREIGN KEY ("B") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

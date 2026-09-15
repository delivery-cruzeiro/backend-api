CREATE TYPE "PrinterConnectionStatus" AS ENUM ('CONNECTED', 'DISCONNECTED', 'ERROR');

CREATE TABLE "printer_configurations" (
    "id" TEXT NOT NULL,
    "store_id" UUID NOT NULL,
    "connection_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "connection_status" "PrinterConnectionStatus" NOT NULL DEFAULT 'DISCONNECTED',
    "is_primary" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "printer_configurations_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "printer_categories" (
    "printer_id" TEXT NOT NULL,
    "category_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "printer_categories_pkey" PRIMARY KEY ("printer_id", "category_id")
);

CREATE TABLE "printer_subcategories" (
    "printer_id" TEXT NOT NULL,
    "subcategory_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "printer_subcategories_pkey" PRIMARY KEY ("printer_id", "subcategory_id")
);

CREATE UNIQUE INDEX "printer_configurations_store_id_connection_id_key"
ON "printer_configurations"("store_id", "connection_id");
CREATE UNIQUE INDEX "printer_configurations_store_id_name_key"
ON "printer_configurations"("store_id", "name");
CREATE INDEX "printer_configurations_store_id_is_primary_idx"
ON "printer_configurations"("store_id", "is_primary");
CREATE UNIQUE INDEX "printer_configurations_one_primary_per_store"
ON "printer_configurations"("store_id") WHERE "is_primary" = true;
CREATE INDEX "printer_categories_category_id_idx" ON "printer_categories"("category_id");
CREATE INDEX "printer_subcategories_subcategory_id_idx" ON "printer_subcategories"("subcategory_id");

ALTER TABLE "printer_configurations"
ADD CONSTRAINT "printer_configurations_store_id_fkey"
FOREIGN KEY ("store_id") REFERENCES "stores"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "printer_categories"
ADD CONSTRAINT "printer_categories_printer_id_fkey"
FOREIGN KEY ("printer_id") REFERENCES "printer_configurations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "printer_categories"
ADD CONSTRAINT "printer_categories_category_id_fkey"
FOREIGN KEY ("category_id") REFERENCES "Category"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "printer_subcategories"
ADD CONSTRAINT "printer_subcategories_printer_id_fkey"
FOREIGN KEY ("printer_id") REFERENCES "printer_configurations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "printer_subcategories"
ADD CONSTRAINT "printer_subcategories_subcategory_id_fkey"
FOREIGN KEY ("subcategory_id") REFERENCES "Subcategory"("id") ON DELETE CASCADE ON UPDATE CASCADE;

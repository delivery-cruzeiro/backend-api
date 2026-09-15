CREATE TYPE "ShippingChargeMode" AS ENUM ('DEFAULT', 'MANUAL', 'TEMPLATE');

CREATE TABLE "store-shipping" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "store_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "value" DECIMAL(10,2) NOT NULL,
    "shipping_time" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "is_active" BOOLEAN NOT NULL DEFAULT TRUE,

    CONSTRAINT "store-shipping_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "store_neighborhood_shipping" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "store_id" UUID NOT NULL,
    "neighborhood" TEXT NOT NULL,
    "mode" "ShippingChargeMode" NOT NULL,
    "shipping_id" UUID,
    "value" DECIMAL(10,2),
    "shipping_time" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "store_neighborhood_shipping_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "store-shipping_store_id_name_key" ON "store-shipping"("store_id", "name");
CREATE INDEX "store-shipping_is_active_idx" ON "store-shipping"("is_active");
CREATE INDEX "store-shipping_store_id_idx" ON "store-shipping"("store_id");

CREATE UNIQUE INDEX "store_neighborhood_shipping_store_id_neighborhood_key"
    ON "store_neighborhood_shipping"("store_id", "neighborhood");
CREATE INDEX "store_neighborhood_shipping_shipping_id_idx" ON "store_neighborhood_shipping"("shipping_id");
CREATE INDEX "store_neighborhood_shipping_store_id_idx" ON "store_neighborhood_shipping"("store_id");

ALTER TABLE "store-shipping"
    ADD CONSTRAINT "store-shipping_store_id_fkey"
    FOREIGN KEY ("store_id") REFERENCES "stores"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "store_neighborhood_shipping"
    ADD CONSTRAINT "store_neighborhood_shipping_store_id_fkey"
    FOREIGN KEY ("store_id") REFERENCES "stores"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "store_neighborhood_shipping"
    ADD CONSTRAINT "store_neighborhood_shipping_shipping_id_fkey"
    FOREIGN KEY ("shipping_id") REFERENCES "store-shipping"("id") ON DELETE SET NULL ON UPDATE CASCADE;

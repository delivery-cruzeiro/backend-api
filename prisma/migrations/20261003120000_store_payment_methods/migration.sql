CREATE TABLE "store_payment_methods" (
    "id" TEXT NOT NULL,
    "store_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "type" "PaymentType" NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "store_payment_methods_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "store_payment_methods_store_id_name_key" ON "store_payment_methods"("store_id", "name");
CREATE INDEX "store_payment_methods_store_id_is_active_idx" ON "store_payment_methods"("store_id", "is_active");
ALTER TABLE "store_payment_methods" ADD CONSTRAINT "store_payment_methods_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "stores"("id") ON DELETE CASCADE ON UPDATE CASCADE;

INSERT INTO "store_payment_methods" ("id", "store_id", "name", "type", "updated_at")
SELECT gen_random_uuid()::text, store_data.id, option_data.name, option_data.type::"PaymentType", CURRENT_TIMESTAMP
FROM "stores" AS store_data
CROSS JOIN (VALUES
    ('Dinheiro', 'CASH'),
    ('PIX', 'PIX'),
    ('Cartão de crédito', 'CREDIT_CARD'),
    ('Cartão de débito', 'DEBIT_CARD')
) AS option_data(name, type);

ALTER TABLE "Order" ADD COLUMN "store_payment_method_id" TEXT;
ALTER TABLE "Order" ADD CONSTRAINT "Order_store_payment_method_id_fkey" FOREIGN KEY ("store_payment_method_id") REFERENCES "store_payment_methods"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "whatsapp_message_configurations" ADD COLUMN "payment_method_id" TEXT;
ALTER TABLE "whatsapp_message_configurations" ADD CONSTRAINT "whatsapp_message_configurations_payment_method_id_fkey" FOREIGN KEY ("payment_method_id") REFERENCES "store_payment_methods"("id") ON DELETE CASCADE ON UPDATE CASCADE;

DROP INDEX IF EXISTS "whatsapp_message_configurations_location_operation_key";
CREATE UNIQUE INDEX "whatsapp_message_configurations_default_event_key" ON "whatsapp_message_configurations"("location", "operation") WHERE "payment_method_id" IS NULL;
CREATE UNIQUE INDEX "whatsapp_message_configurations_payment_event_key" ON "whatsapp_message_configurations"("location", "operation", "payment_method_id") WHERE "payment_method_id" IS NOT NULL;

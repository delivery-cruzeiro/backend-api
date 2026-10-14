ALTER TYPE "PaymentType" ADD VALUE IF NOT EXISTS 'CUSTOM';
ALTER TABLE "store_payment_methods" ADD COLUMN "fields" JSONB NOT NULL DEFAULT '[]';
ALTER TABLE "Order" ADD COLUMN "confirmed_at" TIMESTAMP(3),
  ADD COLUMN "delivery_minutes" INTEGER,
  ADD COLUMN "payment_additional_value" DECIMAL(10,2) NOT NULL DEFAULT 0,
  ADD COLUMN "payment_field_values" JSONB NOT NULL DEFAULT '[]';

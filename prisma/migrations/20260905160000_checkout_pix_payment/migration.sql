ALTER TYPE "WhatsAppMessageLocation" ADD VALUE IF NOT EXISTS 'PIX_ONLINE';
ALTER TABLE "Order" ADD COLUMN "paymentType" "PaymentType";
UPDATE "Order" AS o SET "paymentType" = p."type" FROM "PaymentMethod" AS p WHERE o."paymentMethodId" = p.id;

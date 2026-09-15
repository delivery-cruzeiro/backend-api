CREATE TYPE "WhatsAppMessageLocation" AS ENUM (
  'PENDING',
  'CONFIRMED',
  'PREPARING',
  'ON_THE_WAY'
);

CREATE TYPE "WhatsAppMessageOperation" AS ENUM ('ENTRY', 'EXIT');

CREATE TABLE "whatsapp_message_configurations" (
  "id" TEXT NOT NULL,
  "location" "WhatsAppMessageLocation" NOT NULL,
  "operation" "WhatsAppMessageOperation" NOT NULL,
  "template" JSONB NOT NULL,
  "is_active" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "whatsapp_message_configurations_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "whatsapp_message_configurations_location_operation_key"
  ON "whatsapp_message_configurations"("location", "operation");

CREATE INDEX "whatsapp_message_configurations_location_operation_is_active_idx"
  ON "whatsapp_message_configurations"("location", "operation", "is_active");

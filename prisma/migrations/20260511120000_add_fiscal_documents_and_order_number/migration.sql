CREATE TYPE "FiscalDocumentType" AS ENUM ('NFE', 'NFCE');

CREATE TYPE "FiscalDocumentStatus" AS ENUM (
    'PENDING',
    'PROCESSING',
    'AUTHORIZED',
    'REJECTED',
    'CANCELED',
    'CONTINGENCY'
);

ALTER TABLE "Order"
ADD COLUMN "orderNumber" INTEGER;

WITH numbered_orders AS (
    SELECT
        "id",
        ROW_NUMBER() OVER (ORDER BY "createdAt" ASC, "id" ASC)::INTEGER AS "orderNumber"
    FROM "Order"
)
UPDATE "Order"
SET "orderNumber" = numbered_orders."orderNumber"
FROM numbered_orders
WHERE "Order"."id" = numbered_orders."id";

CREATE SEQUENCE "Order_orderNumber_seq";

SELECT setval(
    '"Order_orderNumber_seq"',
    COALESCE((SELECT MAX("orderNumber") FROM "Order"), 0) + 1,
    false
);

ALTER SEQUENCE "Order_orderNumber_seq" OWNED BY "Order"."orderNumber";

ALTER TABLE "Order"
ALTER COLUMN "orderNumber" SET DEFAULT nextval('"Order_orderNumber_seq"'),
ALTER COLUMN "orderNumber" SET NOT NULL;

CREATE UNIQUE INDEX "Order_orderNumber_key" ON "Order"("orderNumber");

CREATE TABLE "fiscal_sequences" (
    "id" TEXT NOT NULL,
    "model" VARCHAR(2) NOT NULL,
    "serie" VARCHAR(3) NOT NULL DEFAULT '009',
    "current_number" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "fiscal_sequences_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "fiscal_documents" (
    "id" TEXT NOT NULL,
    "order_id" TEXT NOT NULL,
    "type" "FiscalDocumentType" NOT NULL,
    "status" "FiscalDocumentStatus" NOT NULL DEFAULT 'PENDING',
    "access_key" TEXT,
    "protocol" TEXT,
    "xml_path" TEXT,
    "pdf_path" TEXT,
    "sefaz_response" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "fiscal_documents_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "fiscal_sequences_model_serie_key" ON "fiscal_sequences"("model", "serie");
CREATE UNIQUE INDEX "fiscal_documents_access_key_key" ON "fiscal_documents"("access_key");

CREATE INDEX "fiscal_documents_order_id_idx" ON "fiscal_documents"("order_id");
CREATE INDEX "fiscal_documents_type_idx" ON "fiscal_documents"("type");
CREATE INDEX "fiscal_documents_status_idx" ON "fiscal_documents"("status");
CREATE INDEX "fiscal_documents_created_at_idx" ON "fiscal_documents"("created_at");

ALTER TABLE "fiscal_documents"
ADD CONSTRAINT "fiscal_documents_order_id_fkey"
FOREIGN KEY ("order_id") REFERENCES "Order"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

CREATE OR REPLACE FUNCTION update_updated_at_snake_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW."updated_at" = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_fiscal_sequences_updated_at
BEFORE UPDATE ON "fiscal_sequences"
FOR EACH ROW EXECUTE FUNCTION update_updated_at_snake_column();

CREATE TRIGGER update_fiscal_documents_updated_at
BEFORE UPDATE ON "fiscal_documents"
FOR EACH ROW EXECUTE FUNCTION update_updated_at_snake_column();

INSERT INTO "fiscal_sequences" ("id", "model", "serie", "current_number", "created_at", "updated_at")
VALUES
    ('fiscal_sequence_55_009', '55', '009', 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('fiscal_sequence_65_009', '65', '009', 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("model", "serie") DO NOTHING;

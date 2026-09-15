ALTER TABLE "fiscal_documents"
ADD COLUMN "model" VARCHAR(2),
ADD COLUMN "serie" VARCHAR(3),
ADD COLUMN "emission_type" VARCHAR(1),
ADD COLUMN "fiscal_number" VARCHAR(9),
ADD COLUMN "xml_content" TEXT;

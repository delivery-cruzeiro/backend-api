ALTER TABLE "Product"
	ADD COLUMN "additional_fields" JSONB NOT NULL DEFAULT '[]'::jsonb;

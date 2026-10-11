ALTER TABLE "Category"
ADD COLUMN "additional_fields" JSONB NOT NULL DEFAULT '[]';

ALTER TABLE "Subcategory"
ADD COLUMN "additional_fields" JSONB NOT NULL DEFAULT '[]';

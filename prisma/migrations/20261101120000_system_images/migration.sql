BEGIN;
ALTER TABLE "Category" ADD COLUMN "imageUrls" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "Subcategory" ADD COLUMN "imageUrls" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "Product" ADD COLUMN "imageUrls" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
UPDATE "Category" SET "imageUrls" = ARRAY["imageUrl"] WHERE "imageUrl" IS NOT NULL AND "imageUrl" <> '';
UPDATE "Subcategory" SET "imageUrls" = ARRAY["imageUrl"] WHERE "imageUrl" IS NOT NULL AND "imageUrl" <> '';
UPDATE "Product" SET "imageUrls" = ARRAY["imageUrl"] WHERE "imageUrl" IS NOT NULL AND "imageUrl" <> '';
CREATE TABLE "SystemImage" (
  "id" TEXT PRIMARY KEY,
  "url" TEXT NOT NULL UNIQUE,
  "publicId" TEXT UNIQUE,
  "name" TEXT NOT NULL,
  "directory" TEXT NOT NULL DEFAULT 'geral',
  "width" INTEGER,
  "height" INTEGER,
  "bytes" INTEGER,
  "deleting" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "SystemImage_directory_createdAt_idx" ON "SystemImage" ("directory", "createdAt");
-- Index the existing references without moving or duplicating files.
INSERT INTO "SystemImage" ("id", "url", "name", "directory")
SELECT 'legacy_' || md5(url), url, COALESCE(NULLIF(regexp_replace(split_part(url, '?', 1), '^.*/', ''), ''), 'Imagem'), min(directory)
FROM (
  SELECT "imageUrl" AS url, 'categorias' AS directory FROM "Category"
  UNION ALL SELECT "imageUrl", 'subcategorias' FROM "Subcategory"
  UNION ALL SELECT "imageUrl", 'produtos' FROM "Product"
  UNION ALL SELECT "imageUrl", 'menus' FROM "Menu"
  UNION ALL SELECT slide->>'imageUrl', 'carrossel' FROM carousels, jsonb_array_elements(COALESCE(content->'slides', '[]'::jsonb)) slide
) images WHERE url IS NOT NULL AND url <> '' GROUP BY url;
ALTER TABLE "SystemImage" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "SystemImage" FORCE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON "SystemImage" TO delivery_app;
CREATE POLICY server_access ON "SystemImage" TO delivery_app USING (true) WITH CHECK (true);
COMMIT;

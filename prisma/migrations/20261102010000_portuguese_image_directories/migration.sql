BEGIN;
-- Merge only library metadata; do not rename Cloudinary assets or change URLs.
WITH aliases(source, target) AS (VALUES
  ('categories', 'categorias'), ('categorias', 'categorias'),
  ('subcategories', 'subcategorias'), ('subcategorias', 'subcategorias'),
  ('products', 'produtos'), ('produtos', 'produtos'),
  ('carousel', 'carrossel'), ('carousels', 'carrossel'), ('carrossel', 'carrossel')
)
UPDATE "SystemImage" image
SET "directory" = aliases.target || CASE
  WHEN strpos(image."directory", '/') > 0
    THEN substring(image."directory" FROM strpos(image."directory", '/'))
  ELSE '' END,
  "updatedAt" = CURRENT_TIMESTAMP
FROM aliases
WHERE lower(split_part(image."directory", '/', 1)) = aliases.source
  AND split_part(image."directory", '/', 1) <> aliases.target;
COMMIT;

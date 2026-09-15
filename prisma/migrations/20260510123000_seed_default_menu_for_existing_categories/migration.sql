-- Preserve the public catalog after introducing menus by grouping existing categories.
INSERT INTO "Menu" ("id", "name", "description", "order", "isActive", "createdAt", "updatedAt")
SELECT
    'menu_default',
    'Cardapio principal',
    'Menu criado automaticamente para categorias existentes.',
    0,
    true,
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
WHERE NOT EXISTS (
    SELECT 1 FROM "Menu" WHERE "name" = 'Cardapio principal'
);

INSERT INTO "_MenuCategories" ("A", "B")
SELECT "Category"."id", "Menu"."id"
FROM "Category"
CROSS JOIN "Menu"
WHERE "Menu"."name" = 'Cardapio principal'
  AND NOT EXISTS (
      SELECT 1
      FROM "_MenuCategories"
      WHERE "_MenuCategories"."A" = "Category"."id"
        AND "_MenuCategories"."B" = "Menu"."id"
  );

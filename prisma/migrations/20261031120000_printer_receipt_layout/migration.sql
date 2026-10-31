-- Nullable for compatibility: existing assignments and sections remain intact.
ALTER TABLE "printer_configurations" ADD COLUMN "receipt_layout" JSONB;
ALTER TABLE "OrderItem" ADD COLUMN "additional_field_values" JSONB;
UPDATE "printer_configurations" p SET "receipt_layout" = jsonb_build_object(
  'version', 1,
  'categoriesEnabled', p."is_primary" OR EXISTS (SELECT 1 FROM "printer_categories" c WHERE c."printer_id" = p."id"),
  'subcategoriesEnabled', p."is_primary" OR EXISTS (SELECT 1 FROM "printer_subcategories" s WHERE s."printer_id" = p."id"),
  'orderDataEnabled', p."is_primary" OR cardinality(p."receipt_sections") > 0,
  'showLogo', p."is_primary", 'feedLines', 3,
  'categories', '{}'::jsonb, 'subcategories', '{}'::jsonb, 'orderFields', '{}'::jsonb
);

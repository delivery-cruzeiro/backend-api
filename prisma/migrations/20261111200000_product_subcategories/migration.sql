CREATE TABLE "_ProductSubcategories" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,
    CONSTRAINT "_ProductSubcategories_AB_pkey" PRIMARY KEY ("A", "B")
);
CREATE INDEX "_ProductSubcategories_B_index" ON "_ProductSubcategories"("B");
ALTER TABLE "_ProductSubcategories" ADD CONSTRAINT "_ProductSubcategories_A_fkey" FOREIGN KEY ("A") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "_ProductSubcategories" ADD CONSTRAINT "_ProductSubcategories_B_fkey" FOREIGN KEY ("B") REFERENCES "Subcategory"("id") ON DELETE CASCADE ON UPDATE CASCADE;
INSERT INTO "_ProductSubcategories" ("A", "B") SELECT "id", "subcategoryId" FROM "Product" WHERE "subcategoryId" IS NOT NULL;
GRANT SELECT, INSERT, UPDATE, DELETE ON "_ProductSubcategories" TO delivery_app;

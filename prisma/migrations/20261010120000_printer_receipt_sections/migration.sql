ALTER TABLE "printer_configurations"
ADD COLUMN "receipt_sections" TEXT[] NOT NULL DEFAULT ARRAY['customer', 'address', 'payment', 'notes', 'totals']::TEXT[];

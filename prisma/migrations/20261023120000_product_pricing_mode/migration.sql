ALTER TABLE "Product" ADD COLUMN "pricing_mode" TEXT NOT NULL DEFAULT 'FIXED';
ALTER TABLE "Product" ADD CONSTRAINT "product_pricing_mode_check" CHECK ("pricing_mode" IN ('FIXED', 'ADDITIVE'));

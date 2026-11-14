ALTER TABLE printer_configurations ADD COLUMN fiscal_layout JSONB;
ALTER TABLE printer_configurations ADD COLUMN is_fiscal BOOLEAN NOT NULL DEFAULT false;
CREATE UNIQUE INDEX printer_configurations_one_fiscal_per_store ON printer_configurations(store_id) WHERE is_fiscal;

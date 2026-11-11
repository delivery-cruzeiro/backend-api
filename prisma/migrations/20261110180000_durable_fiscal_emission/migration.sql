ALTER TYPE "FiscalDocumentStatus" ADD VALUE 'AWAITING_SEFAZ';

ALTER TABLE "stores" ADD COLUMN "fiscal_profile" JSONB;
ALTER TABLE "Product" ADD COLUMN "fiscal_data" JSONB;
ALTER TABLE "Order" ADD COLUMN "fiscal_recipient" JSONB;

ALTER TABLE fiscal_documents
  ADD COLUMN environment VARCHAR(1),
  ADD COLUMN issuer_cnpj VARCHAR(14),
  ADD COLUMN lease_until TIMESTAMP(3),
  ADD COLUMN lease_token TEXT,
  ADD COLUMN next_attempt_at TIMESTAMP(3),
  ADD COLUMN receipt TEXT,
  ADD COLUMN authorized_xml TEXT,
  ADD COLUMN authorized_hash TEXT,
  ADD COLUMN authorized_at TIMESTAMP(3);
CREATE UNIQUE INDEX fiscal_documents_order_id_environment_key ON fiscal_documents(order_id, environment);
CREATE INDEX fiscal_documents_status_next_attempt_at_idx ON fiscal_documents(status, next_attempt_at);

ALTER TABLE fiscal_documents DROP CONSTRAINT fiscal_documents_order_id_fkey;
ALTER TABLE fiscal_documents ADD CONSTRAINT fiscal_documents_order_id_fkey
  FOREIGN KEY (order_id) REFERENCES "Order"(id) ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE fiscal_sequences
  ADD COLUMN issuer_cnpj VARCHAR(14) NOT NULL DEFAULT 'LEGACY',
  ADD COLUMN environment VARCHAR(1) NOT NULL DEFAULT '0';
DROP INDEX fiscal_sequences_model_serie_key;
CREATE UNIQUE INDEX fiscal_sequences_issuer_cnpj_environment_model_serie_key
  ON fiscal_sequences(issuer_cnpj, environment, model, serie);

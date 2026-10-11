ALTER TABLE "User" ADD COLUMN "cpf" TEXT;
CREATE INDEX "User_cpf_prefix_idx" ON "User" ("cpf" text_pattern_ops);
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE INDEX "User_name_prefix_idx" ON "User" USING gin ("name" gin_trgm_ops);

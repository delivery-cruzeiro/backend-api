CREATE TABLE "carousels" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT false,
    "content" JSONB NOT NULL,
    "store_id" UUID NOT NULL,
    "created_by_id" TEXT NOT NULL,
    "last_modified_by_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "carousels_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "carousels_store_id_updated_at_idx" ON "carousels"("store_id", "updated_at");
CREATE INDEX "carousels_created_by_id_idx" ON "carousels"("created_by_id");
CREATE INDEX "carousels_last_modified_by_id_idx" ON "carousels"("last_modified_by_id");

-- PostgreSQL garante no banco que cada loja tenha no maximo um carousel ativo.
CREATE UNIQUE INDEX "carousels_one_active_per_store_idx"
ON "carousels"("store_id")
WHERE "is_active" = true;

ALTER TABLE "carousels"
ADD CONSTRAINT "carousels_store_id_fkey"
FOREIGN KEY ("store_id") REFERENCES "stores"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "carousels"
ADD CONSTRAINT "carousels_created_by_id_fkey"
FOREIGN KEY ("created_by_id") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "carousels"
ADD CONSTRAINT "carousels_last_modified_by_id_fkey"
FOREIGN KEY ("last_modified_by_id") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

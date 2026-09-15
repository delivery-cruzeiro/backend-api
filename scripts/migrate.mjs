import { Client } from 'pg';
import { readFile } from 'node:fs/promises';
import { createHash, randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';

const client = new Client({ connectionString: process.env.DATABASE_URL });
await client.connect();
try {
  // Serialize first installation and deployment within this application.
  await client.query('SELECT pg_advisory_lock(728146301)');
  const existing = await client.query("SELECT 1 FROM pg_class c JOIN pg_namespace n ON c.relnamespace=n.oid WHERE n.nspname='public' AND c.relkind IN ('r','p','v','m','S') LIMIT 1");
  if (existing.rowCount === 0) {
    const email = process.env.DEFAULT_ADMIN_EMAIL;
    if (!email) throw new Error('DEFAULT_ADMIN_EMAIL is required to initialize an empty database');
    const migration = '20250115222000_init';
    const sql = await readFile(new URL('../prisma/migrations/' + migration + '/migration.sql', import.meta.url), 'utf8');
    await client.query('BEGIN');
    try {
      // Execute the unmodified first migration, its required seed, and its receipt atomically.
      await client.query(sql);
      await client.query('INSERT INTO "User" (id,email,name,role,"updatedAt") VALUES ($1,$2,$3,$4,NOW())', [randomUUID(), email, 'admin', 'ADMIN']);
      await client.query(`CREATE TABLE "_prisma_migrations" (
        "id" VARCHAR(36) PRIMARY KEY NOT NULL,
        "checksum" VARCHAR(64) NOT NULL,
        "finished_at" TIMESTAMPTZ,
        "migration_name" VARCHAR(255) NOT NULL,
        "logs" TEXT,
        "rolled_back_at" TIMESTAMPTZ,
        "started_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "applied_steps_count" INTEGER NOT NULL DEFAULT 0
      )`);
      await client.query('INSERT INTO "_prisma_migrations" (id,checksum,migration_name,finished_at,applied_steps_count) VALUES ($1,$2,$3,NOW(),1)', [randomUUID(), createHash('sha256').update(sql).digest('hex'), migration]);
      await client.query('COMMIT');
      console.log('Empty database initialized with the original initial migration and bootstrap administrator.');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    }
  }
  const code = await new Promise((resolve, reject) => {
    const child = spawn('./node_modules/.bin/prisma', ['migrate', 'deploy'], { stdio: 'inherit' });
    child.on('error', reject);
    child.on('exit', code => resolve(code ?? 1));
  });
  if (code !== 0) throw new Error('Migration deployment failed; existing data was not reset.');
} finally {
  await client.query('SELECT pg_advisory_unlock(728146301)').catch(() => {});
  await client.end();
}

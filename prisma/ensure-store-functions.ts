import 'dotenv/config';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { Client } from 'pg';

const migrationURL = new URL(
	'./migrations/20260802151500_ensure_store_closed_functions/migration.sql',
	import.meta.url,
);

const databaseURL = process.env.DATABASE_URL;

if (!databaseURL) {
	throw new Error('DATABASE_URL is required to ensure store functions');
}

const client = new Client({
	connectionString: databaseURL,
});

try {
	const migrationPath = fileURLToPath(migrationURL);
	const sql = await readFile(migrationPath, 'utf8');

	await client.connect();
	await client.query(sql);
	console.log('Store closed helper functions are ready.');
} finally {
	await client.end();
}

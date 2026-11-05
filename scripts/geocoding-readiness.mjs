// Administrative read-only diagnostic. Never reads customer address fields.
import { pathToFileURL } from 'node:url';

export async function inspectGeocodingReference(client) {
  const tables = (await client.query(`SELECT
    to_regclass('public.cnefe_datasets') IS NOT NULL AS datasets,
    to_regclass('public.cnefe_addresses') IS NOT NULL AS addresses`)).rows[0];
  if (!tables.datasets || !tables.addresses) return { status: 'schema_missing', tables };
  const permissions = (await client.query(`SELECT
    has_table_privilege(current_user, 'public.cnefe_datasets', 'SELECT') AS datasets,
    has_table_privilege(current_user, 'public.cnefe_addresses', 'SELECT') AS addresses`)).rows[0];
  if (!permissions.datasets || !permissions.addresses)
    return { status: 'read_denied', permissions };
  const datasets = (await client.query(`SELECT d.municipality_code, d.version,
    d.record_count AS expected_records, count(a.source_id)::integer AS actual_records
    FROM cnefe_datasets d LEFT JOIN cnefe_addresses a ON a.dataset_id = d.id
    WHERE d.active GROUP BY d.id ORDER BY d.municipality_code`)).rows;
  const campina = datasets.find(item => item.municipality_code === '2504009');
  return {
    status: !campina ? 'campina_grande_dataset_missing'
      : campina.actual_records !== 215660 || campina.actual_records !== campina.expected_records
        ? 'reference_count_mismatch' : 'ready',
    datasets,
  };
}

export function diagnosticError(error) {
  const code = error?.cause?.code ?? error?.code;
  // Do not log messages, request URLs, bodies, connection strings or stack traces.
  return {
    ...(typeof code === 'string' && /^[A-Z0-9_]{2,48}$/.test(code) ? { code } : {}),
    timeout: error?.name === 'TimeoutError' || error?.name === 'AbortError',
  };
}

export async function runReadiness({ connect, emit }) {
  let client;
  try {
    client = await connect();
    await client.query('BEGIN READ ONLY');
    emit({ event: 'geocoding_readiness', provider: 'IBGE_CNEFE', ...await inspectGeocodingReference(client) });
  } catch (error) {
    emit({ event: 'geocoding_readiness', provider: 'IBGE_CNEFE', status: 'unavailable', ...diagnosticError(error) });
  } finally {
    if (client) {
      await client.query('ROLLBACK').catch(() => {});
      await client.end();
    }
  }
}

async function main() {
  const { Client } = await import('pg');
  await runReadiness({
    connect: async () => {
      const client = new Client({ connectionString: process.env.DATABASE_URL,
        connectionTimeoutMillis: 5000, query_timeout: 10000 });
      try { await client.connect(); return client; }
      catch (error) { await client.end().catch(() => {}); throw error; }
    },
    emit: result => console.log(JSON.stringify(result)),
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();

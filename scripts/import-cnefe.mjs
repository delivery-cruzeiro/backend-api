// Explicit administrative import; never invoked by checkout or server startup.
import { createReadStream } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { createHash, randomUUID } from 'node:crypto';
import { parseArgs } from 'node:util';
import { parse } from 'csv-parse';
import { Client } from 'pg';
import {
	comparable,
	geocodingStreetKey,
	houseNumber,
} from '../dist/services/geocoding/geocoding-provider.js';

const { values } = parseArgs({
	options: { csv: { type: 'string' }, manifest: { type: 'string' } },
});
if (!values.csv || !values.manifest)
	throw Error('Required: --csv /path/file.csv --manifest /path/manifest.json');
const manifest = JSON.parse(await readFile(values.manifest, 'utf8'));
if (
	!/^\d{7}$/.test(manifest.municipalityCode) ||
	!/^[A-Z]{2}$/.test(manifest.state) ||
	!manifest.city ||
	!manifest.version ||
	!Number.isInteger(manifest.referenceYear) ||
	!/^[a-f0-9]{64}$/.test(manifest.csvSha256) ||
	!/^https:\/\/ftp\.ibge\.gov\.br\/Cadastro_Nacional_de_Enderecos_para_Fins_Estatisticos\//.test(
		manifest.source
	)
)
	throw Error('Invalid CNEFE source manifest');
const inputHash = createHash('sha256');
for await (const chunk of createReadStream(values.csv)) inputHash.update(chunk);
if (inputHash.digest('hex') !== manifest.csvSha256)
	throw Error('CSV checksum mismatch; no data changed');

const client = new Client({ connectionString: process.env.DATABASE_URL });
await client.connect();
try {
	const identity = await client.query('SELECT current_user');
	if (identity.rows[0].current_user === 'delivery_app')
		throw Error('Use the administrative migration connection for imports');
	await client.query('BEGIN');
	try {
		await client.query('SELECT pg_advisory_xact_lock(1145262664)');
		const previous = await client.query(
			'SELECT id,record_count,city_key,state,version FROM cnefe_datasets WHERE municipality_code=$1 AND checksum=$2',
			[manifest.municipalityCode, manifest.csvSha256]
		);
		if (
			previous.rowCount &&
			(previous.rows[0].city_key !== comparable(manifest.city) ||
				previous.rows[0].state !== manifest.state ||
				previous.rows[0].version !== manifest.version)
		)
			throw Error('Manifest metadata differs from the immutable dataset');
		if (previous.rowCount) {
			const existing = await client.query('SELECT count(*)::integer AS records FROM cnefe_addresses WHERE dataset_id=$1', [previous.rows[0].id]);
			if (existing.rows[0].records !== previous.rows[0].record_count
				|| (manifest.expectedRecords && existing.rows[0].records !== manifest.expectedRecords))
				throw Error('Existing CNEFE dataset is incomplete; no version activated');
		}
		let datasetId = previous.rows[0]?.id;
		let count = previous.rows[0]?.record_count ?? 0,
			read = 0,
			skipped = 0;
		if (!datasetId) {
			datasetId = randomUUID();
			await client.query(
				`INSERT INTO cnefe_datasets(id,municipality_code,city_key,state,version,checksum,source_url,reference_year,record_count)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,0)`,
				[
					datasetId,
					manifest.municipalityCode,
					comparable(manifest.city),
					manifest.state,
					manifest.version,
					manifest.csvSha256,
					manifest.source,
					manifest.referenceYear,
				]
			);
			const hash = createHash('sha256');
			const stream = createReadStream(values.csv);
			stream.on('data', chunk => hash.update(chunk));
			const required = [
				'COD_UNICO_ENDERECO',
				'COD_MUNICIPIO',
				'CEP',
				'NOM_TIPO_SEGLOGR',
				'NOM_TITULO_SEGLOGR',
				'NOM_SEGLOGR',
				'NUM_ENDERECO',
				'DSC_MODIFICADOR',
				'LATITUDE',
				'LONGITUDE',
				'NV_GEO_COORD',
			];
			const parser = stream.pipe(
				parse({
					bom: true,
					delimiter: ';',
					skip_empty_lines: true,
					max_record_size: 65536,
					columns: columns => {
						if (required.some(c => !columns.includes(c)))
							throw Error('Missing CNEFE columns');
						return columns;
					},
				})
			);
			// Propagate filesystem errors to the async iterator, not to an unhandled stream event.
			stream.on('error', error => parser.destroy(error));
			let batch = [];
			const flush = async () => {
				if (!batch.length) return;
				const parameters = [];
				const tuples = batch.map(row => {
					const start = parameters.length;
					parameters.push(...row);
					return '(' + row.map((_, i) => '$' + (start + i + 1)).join(',') + ')';
				});
				await client.query(
					`INSERT INTO cnefe_addresses(dataset_id,source_id,zip_code,street_key,number_key,latitude,longitude,geo_level) VALUES ${tuples.join(',')}`,
					parameters
				);
				count += batch.length;
				batch = [];
			};
			for await (const row of parser) {
				read++;
				if (row.COD_MUNICIPIO !== manifest.municipalityCode)
					throw Error('CSV contains another municipality');
				const zip = String(row.CEP).replace(/\D/g, '');
				const street = geocodingStreetKey(
					[row.NOM_TIPO_SEGLOGR, row.NOM_TITULO_SEGLOGR, row.NOM_SEGLOGR]
						.filter(Boolean)
						.join(' ')
				);
				const number = houseNumber(`${row.NUM_ENDERECO} ${row.DSC_MODIFICADOR}`);
				const latitude = Number(row.LATITUDE),
					longitude = Number(row.LONGITUDE),
					level = Number(row.NV_GEO_COORD);
				if (
					!row.COD_UNICO_ENDERECO ||
					zip.length !== 8 ||
					/^0+$/.test(zip) ||
					!street ||
					!number ||
					number === '0' ||
					!/\d/.test(number) ||
					!String(row.LATITUDE).trim() ||
					!String(row.LONGITUDE).trim() ||
					!Number.isFinite(latitude) ||
					!Number.isFinite(longitude) ||
					latitude < -34 ||
					latitude > 6 ||
					longitude < -74 ||
					longitude > -34 ||
					!Number.isInteger(level) ||
					level < 1 ||
					level > 6
				) {
					skipped++;
					continue;
				}
				batch.push([
					datasetId,
          // The official file repeats address IDs for some units/species.
          // Preserve every row; dataset checksum makes this ordinal stable.
					`${row.COD_UNICO_ENDERECO}:${read}`,
					zip,
					street,
					number,
					latitude,
					longitude,
					level,
				]);
				if (batch.length >= 1000) await flush();
			}
			await flush();
			if (hash.digest('hex') !== manifest.csvSha256)
				throw Error('CSV checksum mismatch; import rolled back');
			if (!count || (manifest.expectedRecords && read !== manifest.expectedRecords))
				throw Error('Unexpected CNEFE record count');
			await client.query('UPDATE cnefe_datasets SET record_count=$2 WHERE id=$1', [
				datasetId,
				count,
			]);
		}
		// Atomic switch; retain every previous dataset for explicit rollback/revalidation.
		await client.query(
			'UPDATE cnefe_datasets SET active=false WHERE city_key=$1 AND state=$2 AND active=true',
			[comparable(manifest.city), manifest.state]
		);
		await client.query('UPDATE cnefe_datasets SET active=true WHERE id=$1', [datasetId]);
		await client.query('COMMIT');
		console.log(
			JSON.stringify({
				source: 'IBGE_CNEFE',
				municipalityCode: manifest.municipalityCode,
				version: manifest.version,
				checksum: manifest.csvSha256,
				records: count,
				read,
				skipped,
				reused: !!previous.rowCount,
				active: true,
			})
		);
	} catch (error) {
		await client.query('ROLLBACK');
		throw error;
	}
} finally {
	await client.end();
}

import { Pool, type PoolClient } from 'pg';

export interface GeocodingRequestQueue {
	run<T>(request: (signal: AbortSignal) => Promise<T>): Promise<T>;
}

const LOCK_NAMESPACE = 1145262663;
const LOCK_ID = 1;
let pool: Pool | undefined;

function getPool() {
	if (!pool) {
		pool = new Pool({
			connectionString: process.env.DATABASE_URL,
			max: 1,
			connectionTimeoutMillis: 10000,
		});
		pool.on('error', () => console.warn('nominatim_queue_database_unavailable'));
	}
	return pool;
}

/** FIFO in-process, with a PostgreSQL session lock shared by every API process. */
export class NominatimRequestQueue implements GeocodingRequestQueue {
	private tail: Promise<void> = Promise.resolve();
	constructor(private readonly connect: () => Promise<PoolClient> = () => getPool().connect()) {}

	run<T>(request: (signal: AbortSignal) => Promise<T>): Promise<T> {
		const result = this.tail.then(() => this.exclusive(request));
		// Failure of one job must not reject or skip subsequent jobs.
		this.tail = result.then(
			() => undefined,
			() => undefined
		);
		return result;
	}

	private async exclusive<T>(request: (signal: AbortSignal) => Promise<T>): Promise<T> {
		const client = await this.connect();
		const controller = new AbortController();
		const onError = () => controller.abort();
		client.on('error', onError);
		let locked = false;
		let reusable = false;
		try {
			await client.query('SELECT pg_advisory_lock($1, $2)', [LOCK_NAMESPACE, LOCK_ID]);
			locked = true;
			// The previous holder has finished. Delay while holding the lock before
			// starting: this also protects a takeover after a process terminates.
			await client.query('SELECT pg_sleep(1.05)');
			return await request(controller.signal);
		} finally {
			try {
				if (locked) {
					// The job includes body parsing. The next holder waits a full second
					// after this release, including when the current request failed.
					await client.query('SELECT pg_advisory_unlock($1, $2)', [
						LOCK_NAMESPACE,
						LOCK_ID,
					]);
					reusable = true;
				}
			} finally {
				client.removeListener('error', onError);
				// Destroy uncertain sessions rather than returning a possibly held lock.
				client.release(!reusable);
			}
		}
	}

	async drain() {
		await this.tail;
	}
}

export const nominatimRequestQueue = new NominatimRequestQueue();

export async function closeNominatimQueue() {
	await nominatimRequestQueue.drain();
	await pool?.end();
	pool = undefined;
}

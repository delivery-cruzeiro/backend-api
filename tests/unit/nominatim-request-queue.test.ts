import { EventEmitter } from 'node:events';
import type { PoolClient } from 'pg';
import { describe, expect, it, vi } from 'vitest';
import { NominatimRequestQueue } from '../../src/lib/nominatim-request-queue.js';

function client() {
	return Object.assign(new EventEmitter(), {
		query: vi.fn().mockResolvedValue({ rows: [] }),
		release: vi.fn(),
	});
}
describe('Nominatim asynchronous FIFO queue', () => {
	it('serializes simultaneous calls and holds the global lock through cooldown', async () => {
		const connection = client();
		const queue = new NominatimRequestQueue(async () => connection as unknown as PoolClient);
		const events: string[] = [];
		connection.query.mockImplementation(async (sql: string) => {
			events.push(sql);
			return { rows: [] };
		});
		await Promise.all(
			[1, 2, 3].map(i =>
				queue.run(async () => {
					events.push(`start${i}`);
					await Promise.resolve();
					events.push(`end${i}`);
				})
			)
		);
		expect(events).toEqual(
			[1, 2, 3].flatMap(i => [
				'SELECT pg_advisory_lock($1, $2)',
				'SELECT pg_sleep(1.05)',
				`start${i}`,
				`end${i}`,
				'SELECT pg_advisory_unlock($1, $2)',
			])
		);
		expect(connection.release).toHaveBeenCalledTimes(3);
	});
	it('waits and unlocks after a failed call, then processes the next job', async () => {
		const connection = client();
		const queue = new NominatimRequestQueue(async () => connection as unknown as PoolClient);
		const failure = queue.run(async () => {
			throw Error('timeout');
		});
		const next = queue.run(async () => 42);
		await expect(failure).rejects.toThrow('timeout');
		expect(await next).toBe(42);
		expect(connection.query.mock.calls.map(c => c[0])).toEqual([
			'SELECT pg_advisory_lock($1, $2)',
			'SELECT pg_sleep(1.05)',
			'SELECT pg_advisory_unlock($1, $2)',
			'SELECT pg_advisory_lock($1, $2)',
			'SELECT pg_sleep(1.05)',
			'SELECT pg_advisory_unlock($1, $2)',
		]);
	});
	it('never bypasses a failed lock and destroys a session if cleanup fails', async () => {
		const connection = client();
		const queue = new NominatimRequestQueue(async () => connection as unknown as PoolClient);
		const request = vi.fn();
		connection.query.mockRejectedValueOnce(Error('database unavailable'));
		await expect(queue.run(request)).rejects.toThrow('database unavailable');
		expect(request).not.toHaveBeenCalled();
		expect(connection.release).toHaveBeenLastCalledWith(true);
		connection.query.mockImplementation(async (sql: string) => {
			if (sql.includes('pg_advisory_unlock')) throw Error('lost session');
			return { rows: [] };
		});
		await expect(queue.run(async () => 42)).rejects.toThrow('lost session');
		expect(connection.release).toHaveBeenLastCalledWith(true);
	});
	it('aborts the active request if its lock connection fails', async () => {
		const connection = client();
		const queue = new NominatimRequestQueue(async () => connection as unknown as PoolClient);
		await queue.run(async signal => {
			connection.emit('error', Error('disconnected'));
			expect(signal.aborted).toBe(true);
		});
	});
});

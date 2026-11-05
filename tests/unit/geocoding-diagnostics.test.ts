import { afterEach, expect, it, vi } from 'vitest';
import { reportGeocodingFailure } from '../../src/services/geocoding/geocoding-diagnostics.js';
import { inspectGeocodingReference, runReadiness } from '../../scripts/geocoding-readiness.mjs';

afterEach(() => vi.restoreAllMocks());

it('logs HTTP rejection without disclosing a request URL or error message', () => {
	const log = vi.spyOn(console, 'warn').mockImplementation(() => {});
	reportGeocodingFailure('NOMINATIM', 'response', {
		httpStatus: 403,
		error: { message: 'private street and number', code: 'unsafe://credentials' },
	});
	expect(log).toHaveBeenCalledWith('geocoding_provider_unavailable', {
		provider: 'NOMINATIM', stage: 'response', httpStatus: 403,
	});
});

it('distinguishes queue failures and transport timeouts using safe codes', () => {
	const log = vi.spyOn(console, 'warn').mockImplementation(() => {});
	reportGeocodingFailure('NOMINATIM', 'queue', { error: { cause: { code: 'ENOTFOUND' } } });
	expect(log).toHaveBeenLastCalledWith('geocoding_provider_unavailable', {
		provider: 'NOMINATIM', stage: 'queue', code: 'ENOTFOUND',
	});
	reportGeocodingFailure('NOMINATIM', 'request', { error: { name: 'TimeoutError' } });
	expect(log).toHaveBeenLastCalledWith('geocoding_provider_unavailable', {
		provider: 'NOMINATIM', stage: 'request', timeout: true,
	});
});

function clientWith(datasets: unknown[]) {
	return { query: vi.fn()
		.mockResolvedValueOnce({ rows: [{ datasets: true, addresses: true }] })
		.mockResolvedValueOnce({ rows: [{ datasets: true, addresses: true }] })
		.mockResolvedValueOnce({ rows: datasets }) };
}

it('reports a missing reference schema before querying its tables', async () => {
	const client = { query: vi.fn().mockResolvedValue({ rows: [{ datasets: false, addresses: false }] }) };
	expect(await inspectGeocodingReference(client)).toMatchObject({ status: 'schema_missing' });
	expect(client.query).toHaveBeenCalledTimes(1);
});

it('identifies an unimported municipality even when tables exist', async () => {
	expect(await inspectGeocodingReference(clientWith([]))).toMatchObject({
		status: 'campina_grande_dataset_missing',
	});
});

it('requires the actual record count to match the pinned source', async () => {
	const data = { municipality_code: '2504009', expected_records: 215660, actual_records: 0 };
	expect(await inspectGeocodingReference(clientWith([data]))).toMatchObject({ status: 'reference_count_mismatch' });
	expect(await inspectGeocodingReference(clientWith([{ ...data, actual_records: 215660 }]))).toMatchObject({ status: 'ready' });
});

it('reports denied reference access explicitly', async () => {
	const client = { query: vi.fn()
		.mockResolvedValueOnce({ rows: [{ datasets: true, addresses: true }] })
		.mockResolvedValueOnce({ rows: [{ datasets: false, addresses: true }] }) };
	expect(await inspectGeocodingReference(client)).toMatchObject({ status: 'read_denied' });
});

it('keeps diagnostics read-only and closes the connection on failure', async () => {
	const error = Object.assign(new Error('postgresql://secret@host/private'), { code: '42501' });
	const client = { query: vi.fn().mockResolvedValueOnce({}).mockRejectedValueOnce(error).mockResolvedValue({}), end: vi.fn() };
	const emit = vi.fn();
	await runReadiness({ connect: async () => client, emit });
	expect(client.query).toHaveBeenNthCalledWith(1, 'BEGIN READ ONLY');
	expect(client.query).toHaveBeenLastCalledWith('ROLLBACK');
	expect(client.end).toHaveBeenCalled();
	expect(emit).toHaveBeenCalledWith({ event: 'geocoding_readiness', provider: 'IBGE_CNEFE', status: 'unavailable', code: '42501', timeout: false });
	expect(JSON.stringify(emit.mock.calls)).not.toContain('secret');
});

import { describe, expect, it, vi } from 'vitest';
import { CnefeGeocodingProvider } from '../../src/services/geocoding/cnefe-geocoding.provider.js';
const address = {
	street: 'Rua Exemplo',
	number: '12',
	zipCode: '58414000',
	city: 'Campina Grande',
	state: 'PB',
	neighborhood: 'Liberdade',
};
const candidate = { latitude: -7.24, longitude: -35.88, geoLevel: 1, _count: { _all: 1 } };
function setup() {
	const findDataset = vi
		.fn()
		.mockResolvedValue({ id: 'dataset', version: 'censo2022', checksum: 'abc' });
	const findCandidates = vi
		.fn()
		.mockResolvedValue([
			candidate,
			{ ...candidate, geoLevel: 2, longitude: -35.8801, _count: { _all: 100 } },
		]);
	return {
		findDataset,
		findCandidates,
		provider: new CnefeGeocodingProvider({ findDataset, findCandidates }),
	};
}
describe('local CNEFE geocoding', () => {
	it('uses the best source point and retains provenance, quality and unit counts', async () => {
		const { provider, findCandidates } = setup();
		const result = await provider.locate(address);
		expect(result).toMatchObject({
			status: 'found',
			point: { latitude: -7.24, longitude: -35.88 },
			source: 'IBGE_CNEFE',
			sourceVersion: 'censo2022:abc',
			quality: { levels: [1, 2], records: 101, distinctPoints: 2 },
		});
		if (result.status === 'found')
			expect(result.quality!.uncertaintyMeters).toBeGreaterThan(30);
		expect(findCandidates).toHaveBeenCalledWith('dataset', address);
	});
	it('changes the cache identity immediately when an imported dataset changes', async () => {
		const { provider, findDataset } = setup();
		expect(await provider.cacheKeyFor(address)).toContain('abc');
		findDataset.mockResolvedValue({ id: 'new', version: 'new', checksum: 'def' });
		expect(await provider.cacheKeyFor(address)).toContain('def');
	});
	it('rejects dispersed or overly numerous candidates rather than averaging houses', async () => {
		const { provider, findCandidates } = setup();
		findCandidates.mockResolvedValue([candidate, { ...candidate, longitude: -35.89 }]);
		expect(await provider.locate(address)).toEqual({ status: 'ambiguous' });
		findCandidates.mockResolvedValue(Array.from({ length: 65 }, () => candidate));
		expect(await provider.locate(address)).toEqual({ status: 'ambiguous' });
	});
	it('does not use estimated levels or invalid coordinates', async () => {
		for (const invalid of [{ geoLevel: 3 }, { latitude: NaN }, { longitude: -120 }]) {
			const { provider, findCandidates } = setup();
			findCandidates.mockResolvedValue([{ ...candidate, ...invalid }]);
			expect(await provider.locate(address)).toEqual({ status: 'ambiguous' });
		}
	});
	it('allows fallback when source data is absent, input is incomplete or database fails', async () => {
		const { provider, findDataset, findCandidates } = setup();
		findDataset.mockResolvedValueOnce(null);
		expect(await provider.locate(address)).toEqual({ status: 'not_found' });
		findCandidates.mockResolvedValueOnce([]);
		expect(await provider.locate(address)).toEqual({ status: 'not_found' });
		findDataset.mockRejectedValueOnce(Error('offline'));
		expect(await provider.locate(address)).toEqual({ status: 'unavailable' });
		expect(await provider.locate({ ...address, zipCode: '1' })).toEqual({
			status: 'invalid_address',
		});
	});
});

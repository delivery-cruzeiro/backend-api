import { describe, expect, it, vi } from 'vitest';
import { FallbackGeocodingProvider } from '../../src/services/geocoding/fallback-geocoding.provider.js';
const address = {
	street: 'Rua Exemplo',
	number: '12',
	zipCode: '58414000',
	city: 'Campina Grande',
	state: 'PB',
	neighborhood: 'Liberdade',
};
const local = {
	status: 'found',
	point: { latitude: -7.24, longitude: -35.88 },
	source: 'IBGE_CNEFE',
};
describe('local source followed by queued external source', () => {
	it('does not call the external provider when local evidence is accepted', async () => {
		const a = { cacheKey: 'a', locate: vi.fn().mockResolvedValue(local) },
			b = { cacheKey: 'b', locate: vi.fn() };
		expect(await new FallbackGeocodingProvider([a, b]).locate(address)).toEqual(local);
		expect(b.locate).not.toHaveBeenCalled();
	});
	it('falls back on missing, ambiguous or unavailable local data', async () => {
		for (const status of ['not_found', 'ambiguous', 'unavailable']) {
			const a = { cacheKey: 'a', locate: vi.fn().mockResolvedValue({ status }) },
				b = {
					cacheKey: 'b',
					locate: vi.fn().mockResolvedValue({ ...local, source: 'NOMINATIM' }),
				};
			expect(await new FallbackGeocodingProvider([a, b]).locate(address)).toMatchObject({
				source: 'NOMINATIM',
			});
		}
	});
	it('tries the external source if local uncertainty crosses a delivery boundary', async () => {
		const a = { cacheKey: 'a', locate: vi.fn().mockResolvedValue(local) },
			b = {
				cacheKey: 'b',
				locate: vi.fn().mockResolvedValue({ ...local, source: 'NOMINATIM' }),
			};
		const acceptResult = vi.fn(async result => result.source === 'NOMINATIM');
		expect(
			await new FallbackGeocodingProvider([a, b]).locate(address, { acceptResult })
		).toMatchObject({ source: 'NOMINATIM' });
		expect(acceptResult).toHaveBeenCalledTimes(2);
	});
	it('preserves unresolved ambiguity and exposes dataset-sensitive cache keys', async () => {
		const a = {
			cacheKey: 'a',
			cacheKeyFor: vi.fn().mockResolvedValue('dataset:v2'),
			locate: vi.fn().mockResolvedValue(local),
		};
		const b = { cacheKey: 'b', locate: vi.fn().mockResolvedValue({ status: 'not_found' }) };
		const provider = new FallbackGeocodingProvider([a, b]);
		expect(await provider.locate(address, { acceptResult: async () => false })).toEqual({
			status: 'ambiguous',
		});
		expect(await provider.cacheKeyFor(address)).toContain('dataset:v2');
	});
});

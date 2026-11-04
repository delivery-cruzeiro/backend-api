import { describe, expect, it, vi } from 'vitest';
import { NominatimGeocodingProvider } from '../../src/services/geocoding/nominatim-geocoding.provider.js';
const address = {
	street: 'Rua Exemplo',
	number: '12',
	zipCode: '58414000',
	city: 'Campina Grande',
	state: 'PB',
	neighborhood: 'Liberdade',
};
const place = {
	lat: '-7.24',
	lon: '-35.88',
	address: {
		house_number: '12',
		road: 'Rua Exemplo',
		city: 'Campina Grande',
		state: 'Paraíba',
		postcode: '58414-000',
		country_code: 'br',
	},
};
function setup(places: unknown[] = [place]) {
	const fetcher = vi.fn().mockImplementation(async () => new Response(JSON.stringify(places)));
	const run = vi.fn(async (job: (signal: AbortSignal) => Promise<unknown>) =>
		job(new AbortController().signal)
	);
	const provider = new NominatimGeocodingProvider(fetcher, { run: run as never });
	return { fetcher, run, provider };
}
describe('Nominatim address geocoding', () => {
	it('uses structured street + house number, postal code, Brazil and an identifying User-Agent', async () => {
		const { provider, fetcher, run } = setup();
		expect(await provider.locate(address)).toMatchObject({
			status: 'found',
			point: { latitude: -7.24, longitude: -35.88 },
		});
		const [url, options] = fetcher.mock.calls[0];
		expect(url.searchParams.get('street')).toBe('12 Rua Exemplo');
		expect(url.searchParams.get('postalcode')).toBe('58414-000');
		expect(url.searchParams.get('countrycodes')).toBe('br');
		expect(options.headers['user-agent']).toContain('DeliveryCruzeiro');
		expect(options.redirect).toBe('error');
		expect(run).toHaveBeenCalledTimes(1);
	});
	it('rejects street centroids, wrong house/street/city/state/postcode/country', async () => {
		for (const fields of [
			{ house_number: undefined },
			{ house_number: '20' },
			{ road: 'Outra Rua' },
			{ city: 'Outra cidade' },
			{ state: 'Pernambuco' },
			{ postcode: '01001000' },
			{ country_code: 'pt' },
		]) {
			expect(
				await setup([
					{ ...place, address: { ...place.address, ...fields } },
				]).provider.locate(address)
			).toEqual({ status: 'not_found' });
		}
	});
	it('accepts standard abbreviations and municipality fields without changing the house number', async () => {
		expect(
			await setup([
				{
					...place,
					address: {
						...place.address,
						road: 'R. Exemplo',
						city: undefined,
						town: 'Campina Grande',
					},
				},
			]).provider.locate({ ...address, street: 'R. Exemplo', number: '012' })
		).toMatchObject({ status: 'found' });
	});
	it('refuses ambiguous houses and invalid/nonfinite/out-of-country coordinates', async () => {
		expect(await setup([place, { ...place, lon: '-35.89' }]).provider.locate(address)).toEqual({
			status: 'ambiguous',
		});
		for (const coordinates of [
			{ lat: '' },
			{ lat: 'NaN' },
			{ lat: null },
			{ lon: '-120' },
			{ lat: '-35' },
		])
			expect(await setup([{ ...place, ...coordinates }]).provider.locate(address)).toEqual({
				status: 'not_found',
			});
	});
	it('caches matches/misses and deduplicates simultaneous identical queries', async () => {
		for (const places of [[place], []]) {
			const { provider, fetcher } = setup(places);
			await Promise.all([
				provider.locate(address),
				provider.locate(address),
				provider.locate(address),
			]);
			await provider.locate(address);
			expect(fetcher).toHaveBeenCalledTimes(1);
		}
	});
	it('queues each retry, recovers transport errors and does not cache outages', async () => {
		const { provider, fetcher, run } = setup();
		fetcher
			.mockRejectedValueOnce(new Error('timeout'))
			.mockRejectedValueOnce(new Error('timeout'));
		expect(await provider.locate(address)).toEqual({ status: 'unavailable' });
		expect(await provider.locate(address)).toMatchObject({ status: 'found' });
		expect(run).toHaveBeenCalledTimes(3);
	});
	it('does not retry HTTP 429/403 even when their bodies are HTML', async () => {
		for (const status of [429, 403]) {
			const { provider, fetcher } = setup();
			fetcher.mockResolvedValue(new Response('<html>Unavailable</html>', { status }));
			expect(await provider.locate(address)).toEqual({ status: 'unavailable' });
			expect(fetcher).toHaveBeenCalledTimes(1);
		}
	});
	it('retries HTTP 5xx and rejects invalid payloads/addresses without inventing coordinates', async () => {
		const { provider, fetcher } = setup();
		fetcher.mockResolvedValueOnce(new Response('failed', { status: 503 }));
		expect(await provider.locate(address)).toMatchObject({ status: 'found' });
		expect(fetcher).toHaveBeenCalledTimes(2);
		expect(await setup().provider.locate({ ...address, number: 'S/N' })).toEqual({
			status: 'invalid_address',
		});
		expect(await setup().provider.locate({ ...address, zipCode: '1' })).toEqual({
			status: 'invalid_address',
		});
		const malformed = setup();
		malformed.fetcher.mockImplementation(async () => new Response('{}'));
		expect(await malformed.provider.locate(address)).toEqual({ status: 'unavailable' });
	});
	it('finishes reading the body before releasing the queued job', async () => {
		let bodyRead = false;
		const fetcher = vi.fn(
			async () =>
				({
					ok: true,
					status: 200,
					text: async () => {
						await Promise.resolve();
						bodyRead = true;
						return JSON.stringify([place]);
					},
				}) as Response
		);
		const run = async <T>(job: (signal: AbortSignal) => Promise<T>) => {
			const value = await job(new AbortController().signal);
			expect(bodyRead).toBe(true);
			return value;
		};
		expect(
			await new NominatimGeocodingProvider(fetcher, { run }).locate(address)
		).toMatchObject({ status: 'found' });
	});
});

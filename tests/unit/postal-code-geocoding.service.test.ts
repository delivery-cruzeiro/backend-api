import { describe, expect, it, vi } from 'vitest';
import { ViaCepService } from '../../src/services/via-cep.service.js';
import { PostalCodeGeocodingService } from '../../src/services/postal-code-geocoding.service.js';
describe('CEP + number geocoding entry point', () => {
	it('enriches CEP with ViaCEP and sends the original house number to Nominatim', async () => {
		const fetcher = vi.fn(
			async () =>
				new Response(
					JSON.stringify({
						cep: '58414-000',
						logradouro: 'Rua Exemplo',
						bairro: 'Liberdade',
						localidade: 'Campina Grande',
						uf: 'PB',
					})
				)
		);
		const locate = vi
			.fn()
			.mockResolvedValue({ status: 'found', point: { latitude: -7.24, longitude: -35.88 } });
		const service = new PostalCodeGeocodingService(new ViaCepService(fetcher), {
			cacheKey: 'test',
			locate,
		});
		expect(await service.geocode('58414000', 12)).toMatchObject({ status: 'found' });
		expect(locate).toHaveBeenCalledWith(
			expect.objectContaining({
				street: 'Rua Exemplo',
				number: '12',
				city: 'Campina Grande',
				state: 'PB',
			})
		);
	});
	it('returns explicit errors for invalid/generic CEP and postal service outage', async () => {
		const fetcher = vi.fn(
			async () =>
				new Response(
					JSON.stringify({ cep: '58414-000', localidade: 'Campina Grande', uf: 'PB' })
				)
		);
		const locate = vi.fn();
		const service = new PostalCodeGeocodingService(new ViaCepService(fetcher), {
			cacheKey: 'test',
			locate,
		});
		expect(await service.geocode('1', '12')).toEqual({ status: 'invalid_address' });
		expect(await service.geocode('58414000', '12')).toEqual({ status: 'invalid_address' });
		expect(locate).not.toHaveBeenCalled();
		fetcher.mockRejectedValueOnce(Error('offline'));
		expect(await service.geocode('58414000', '12')).toEqual({ status: 'unavailable' });
	});
});

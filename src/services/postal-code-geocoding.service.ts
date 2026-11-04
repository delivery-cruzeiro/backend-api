import { ViaCepService, normalizeZipCode } from './via-cep.service.js';
import { addressGeocodingProvider } from './geocoding/fallback-geocoding.provider.js';
import type { GeocodingProvider, GeocodingResult } from './geocoding/geocoding-provider.js';

/** CEP + number -> ViaCEP address enrichment -> queued Nominatim lookup. */
export class PostalCodeGeocodingService {
	constructor(
		private readonly postalCodes = new ViaCepService(),
		private readonly provider: GeocodingProvider = addressGeocodingProvider
	) {}

	async geocode(cep: string, numero: string | number): Promise<GeocodingResult> {
		const number = String(numero).trim();
		if (normalizeZipCode(cep).length !== 8 || !/\d/.test(number))
			return { status: 'invalid_address' };
		try {
			const address = await this.postalCodes.lookupByZipCode(cep);
			// A generic postal code without a street cannot identify an individual house.
			if (!address?.street) return { status: 'invalid_address' };
			return await this.provider.locate({ ...address, number });
		} catch {
			return { status: 'unavailable' };
		}
	}
}

const postalCodeGeocoding = new PostalCodeGeocodingService();
export const geocodeAddress = (cep: string, numero: string | number): Promise<GeocodingResult> =>
	postalCodeGeocoding.geocode(cep, numero);

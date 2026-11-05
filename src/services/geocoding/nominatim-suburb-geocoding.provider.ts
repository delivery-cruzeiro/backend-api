import { nominatimGeocodingProvider, NominatimGeocodingProvider } from './nominatim-geocoding.provider.js';
import type { GeocodingAddress, GeocodingProvider } from './geocoding-provider.js';

/** Last geographic fallback only; the result is explicitly approximate. */
export class NominatimSuburbGeocodingProvider implements GeocodingProvider {
	readonly cacheKey: string;
	constructor(private readonly provider: NominatimGeocodingProvider = nominatimGeocodingProvider) {
		this.cacheKey = `${provider.cacheKey}:suburb:v1`;
	}
	locate(address: GeocodingAddress) { return this.provider.locateSuburb(address); }
}

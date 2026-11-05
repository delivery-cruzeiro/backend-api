import { CnefeGeocodingProvider } from './cnefe-geocoding.provider.js';
import { nominatimGeocodingProvider } from './nominatim-geocoding.provider.js';
import { NominatimSuburbGeocodingProvider } from './nominatim-suburb-geocoding.provider.js';
import type {
	GeocodingAddress,
	GeocodingOptions,
	GeocodingProvider,
	GeocodingResult,
} from './geocoding-provider.js';

export class FallbackGeocodingProvider implements GeocodingProvider {
	readonly cacheKey: string;
	constructor(private readonly providers: GeocodingProvider[]) {
		this.cacheKey = `fallback:v1:${providers.map(p => p.cacheKey).join('|')}`;
	}
	async cacheKeyFor(address: GeocodingAddress) {
		const keys = await Promise.all(
			this.providers.map(async p => {
				try {
					return (await p.cacheKeyFor?.(address)) ?? p.cacheKey;
				} catch {
					return `${p.cacheKey}:unavailable`;
				}
			})
		);
		return `fallback:v1:${keys.join('|')}`;
	}
	async locate(address: GeocodingAddress, options?: GeocodingOptions): Promise<GeocodingResult> {
		let unresolved: GeocodingResult = { status: 'not_found' };
		for (const provider of this.providers) {
			let result: GeocodingResult;
			try {
				result = await provider.locate(address);
			} catch {
				result = { status: 'unavailable' };
			}
			if (result.status === 'found') {
				if (!options?.acceptResult || (await options.acceptResult(result))) return result;
				unresolved = { status: 'ambiguous' };
			} else if (result.status === 'unavailable') unresolved = result;
			else if (result.status === 'ambiguous' && unresolved.status !== 'unavailable')
				unresolved = result;
			else if (result.status === 'invalid_address' && unresolved.status === 'not_found')
				unresolved = result;
		}
		return unresolved;
	}
}

export const addressGeocodingProvider = new FallbackGeocodingProvider([
	new CnefeGeocodingProvider(),
	nominatimGeocodingProvider,
	new NominatimSuburbGeocodingProvider(),
]);

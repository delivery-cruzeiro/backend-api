import { createHash } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma.js';
import { normalizeZipCode } from './via-cep.service.js';
import {
	comparable,
	houseNumber,
	type GeocodingAddress,
	type GeocodingProvider,
	type GeocodingResult,
	type FoundGeocodingResult,
} from './geocoding/geocoding-provider.js';
import { addressGeocodingProvider } from './geocoding/fallback-geocoding.provider.js';

type Location = {
	latitude: number | null;
	longitude: number | null;
	locationConfirmed: boolean;
	locationAccuracyMeters?: number;
	locationApproximate?: boolean;
};
type LocationOptions = { scope?: string; accept?: (location: Location) => Promise<boolean> };
const located = (result: FoundGeocodingResult): Location => ({
	...result.point,
	locationConfirmed: true,
	...(result.quality ? { locationAccuracyMeters: result.quality.uncertaintyMeters } : {}),
	...(result.precision === 'suburb' ? { locationApproximate: true } : {}),
});
function accuracyRadius(value: unknown): number | undefined {
	if (!value || typeof value !== 'object' || !('uncertaintyMeters' in value)) return undefined;
	const radius = value.uncertaintyMeters;
	return typeof radius === 'number' && Number.isFinite(radius) && radius >= 0
		? radius
		: undefined;
}
const inFlight = new Map<string, Promise<Location>>();

export class AddressGeocodingService {
	constructor(private readonly provider: GeocodingProvider = addressGeocodingProvider) {}

	async locate(address: GeocodingAddress) {
		const result = await this.provider.locate(address);
		return result.status === 'found' ? result.point : null;
	}
	async ensureLocation(id: string, options?: LocationOptions) {
		const address = await prisma.address.findUnique({ where: { id } });
		if (!address) return { latitude: null, longitude: null, locationConfirmed: false };
		const key = createHash('sha256')
			.update(
				JSON.stringify([
					(await this.provider.cacheKeyFor?.(address)) ?? this.provider.cacheKey,
					options?.scope ?? '',
					normalizeZipCode(address.zipCode),
					comparable(address.street),
					houseNumber(address.number),
					comparable(address.city),
					comparable(address.state),
					comparable(address.neighborhood),
				])
			)
			.digest('hex');
		const cachedRadius = accuracyRadius(address.geocodingQuality);
		const approximate = address.geocodingSource === 'NOMINATIM_SUBURB';
		if (
			address.geocodingKey === key &&
			address.geocodingAttemptedAt &&
			((address.locationConfirmed &&
				(!approximate || Date.now() - address.geocodingAttemptedAt.getTime() < 300000) &&
				typeof address.latitude === 'number' &&
				Number.isFinite(address.latitude) &&
				typeof address.longitude === 'number' &&
				Number.isFinite(address.longitude) &&
				(address.geocodingSource !== 'IBGE_CNEFE' || cachedRadius !== undefined)) ||
				(!address.locationConfirmed &&
					Date.now() - address.geocodingAttemptedAt.getTime() < 300000))
		) {
			const cached = {
				latitude: address.latitude,
				longitude: address.longitude,
				locationConfirmed: address.locationConfirmed,
				...(cachedRadius !== undefined ? { locationAccuracyMeters: cachedRadius } : {}),
				...(approximate ? { locationApproximate: true } : {}),
			};
			if (!cached.locationConfirmed || !options?.accept || (await options.accept(cached)))
				return cached;
		}
		const requestKey = `${id}:${key}`;
		const pending = inFlight.get(requestKey);
		if (pending) return pending;
		const task = (async (): Promise<Location> => {
			let result: GeocodingResult;
			try {
				const validation = options?.accept;
				result = await this.provider.locate(
					address,
					validation ? { acceptResult: r => validation(located(r)) } : undefined
				);
				if (result.status === 'found' && validation && !(await validation(located(result))))
					result = { status: 'ambiguous' };
			} catch {
				result = { status: 'unavailable' };
			}
			if (result.status !== 'found') {
				// No address fields, provider response, URL or credentials in operational logs.
				console.warn('address_geocoding_failed', { reason: result.status });
			}
			// Network failure, invalid responses and saturation must not poison the persistent cache.
			if (result.status === 'unavailable')
				return { latitude: null, longitude: null, locationConfirmed: false };
			const location: Location =
				result.status === 'found'
					? located(result)
					: { latitude: null, longitude: null, locationConfirmed: false };
			// Optimistic check prevents a slow geocoder from overwriting an edited address.
			const saved = await prisma.address.updateMany({
				where: { id, updatedAt: address.updatedAt },
				data: {
					latitude: location.latitude,
					longitude: location.longitude,
					locationConfirmed: location.locationConfirmed,
					geocodingKey: key,
					geocodingAttemptedAt: new Date(),
					geocodingSource: result.status === 'found' ? (result.source ?? null) : null,
					geocodingSourceVersion:
						result.status === 'found' ? (result.sourceVersion ?? null) : null,
					geocodingQuality:
						result.status === 'found' && (result.quality || result.precision)
							? { ...result.quality, ...(result.precision ? { precision: result.precision } : {}) }
							: Prisma.DbNull,
				},
			});
			return saved.count
				? location
				: { latitude: null, longitude: null, locationConfirmed: false };
		})();
		inFlight.set(requestKey, task);
		try {
			return await task;
		} finally {
			inFlight.delete(requestKey);
		}
	}
}

import { CnefeGeocodingRepository } from '../../repositories/cnefe-geocoding.repository.js';
import { normalizeZipCode } from '../via-cep.service.js';
import {
	type GeocodingAddress,
	type GeocodingProvider,
	type GeocodingResult,
} from './geocoding-provider.js';

function separation(
	a: { latitude: number; longitude: number },
	b: { latitude: number; longitude: number }
) {
	const r = Math.PI / 180;
	return (
		6371000 *
		2 *
		Math.asin(
			Math.min(
				1,
				Math.sqrt(
					Math.sin(((a.latitude - b.latitude) * r) / 2) ** 2 +
						Math.cos(a.latitude * r) *
							Math.cos(b.latitude * r) *
							Math.sin(((a.longitude - b.longitude) * r) / 2) ** 2
				)
			)
		)
	);
}

export class CnefeGeocodingProvider implements GeocodingProvider {
	readonly cacheKey = 'ibge-cnefe:v1';
	constructor(private readonly repository = new CnefeGeocodingRepository()) {}

	async cacheKeyFor(address: GeocodingAddress) {
		const dataset = await this.repository.findDataset(address);
		return `${this.cacheKey}:${dataset?.checksum ?? 'unavailable-dataset'}`;
	}

	async locate(address: GeocodingAddress): Promise<GeocodingResult> {
		if (
			normalizeZipCode(address.zipCode).length !== 8 ||
			!address.street.trim() ||
			!/\d/.test(address.number)
		)
			return { status: 'invalid_address' };
		try {
			const dataset = await this.repository.findDataset(address);
			if (!dataset) return { status: 'not_found' };
			const candidates = await this.repository.findCandidates(dataset.id, address);
			if (!candidates.length) return { status: 'not_found' };
			if (candidates.length > 64) return { status: 'ambiguous' };
			const point = { latitude: candidates[0].latitude, longitude: candidates[0].longitude };
			let spread = 0;
			for (const p of candidates) {
				if (
					![1, 2].includes(p.geoLevel) ||
					!Number.isFinite(p.latitude) ||
					!Number.isFinite(p.longitude) ||
					p.latitude < -34 ||
					p.latitude > 6 ||
					p.longitude < -74 ||
					p.longitude > -34
				)
					return { status: 'ambiguous' };
				for (const q of candidates) spread = Math.max(spread, separation(p, q));
			}
			if (spread > 25) return { status: 'ambiguous' };
			return {
				status: 'found',
				point,
				source: 'IBGE_CNEFE',
				sourceVersion: `${dataset.version}:${dataset.checksum}`,
				quality: {
					uncertaintyMeters: Math.ceil(30 + spread),
					levels: [...new Set(candidates.map(c => c.geoLevel))],
					records: candidates.reduce((sum, c) => sum + c._count._all, 0),
					distinctPoints: new Set(candidates.map(c => `${c.latitude},${c.longitude}`))
						.size,
					spreadMeters: Math.round(spread * 10) / 10,
				},
			};
		} catch {
			return { status: 'unavailable' };
		}
	}
}

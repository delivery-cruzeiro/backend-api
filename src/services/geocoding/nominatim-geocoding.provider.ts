import { createHash } from 'node:crypto';
import {
	nominatimRequestQueue,
	type GeocodingRequestQueue,
} from '../../lib/nominatim-request-queue.js';
import { normalizeZipCode } from '../via-cep.service.js';
import {
	comparable,
	houseNumber,
	type GeocodingAddress,
	type GeocodingPoint,
	type GeocodingProvider,
	type GeocodingResult,
} from './geocoding-provider.js';

type NominatimPlace = { lat?: unknown; lon?: unknown; address?: Record<string, unknown> };
const states: Record<string, string> = {
	AC: 'Acre',
	AL: 'Alagoas',
	AP: 'Amapá',
	AM: 'Amazonas',
	BA: 'Bahia',
	CE: 'Ceará',
	DF: 'Distrito Federal',
	ES: 'Espírito Santo',
	GO: 'Goiás',
	MA: 'Maranhão',
	MT: 'Mato Grosso',
	MS: 'Mato Grosso do Sul',
	MG: 'Minas Gerais',
	PA: 'Pará',
	PB: 'Paraíba',
	PR: 'Paraná',
	PE: 'Pernambuco',
	PI: 'Piauí',
	RJ: 'Rio de Janeiro',
	RN: 'Rio Grande do Norte',
	RS: 'Rio Grande do Sul',
	RO: 'Rondônia',
	RR: 'Roraima',
	SC: 'Santa Catarina',
	SP: 'São Paulo',
	SE: 'Sergipe',
	TO: 'Tocantins',
};
const streetName = (value: unknown) =>
	comparable(value).replace(/^(rua|r|avenida|av|travessa|tv|alameda|al) /, '');

export class NominatimGeocodingProvider implements GeocodingProvider {
	readonly cacheKey: string;
	private readonly cache = new Map<string, { expires: number; result: GeocodingResult }>();
	private readonly pending = new Map<string, Promise<GeocodingResult>>();

	constructor(
		private readonly fetcher: typeof fetch = (...args) => fetch(...args),
		private readonly queue: GeocodingRequestQueue = nominatimRequestQueue,
		private readonly baseUrl = process.env.NOMINATIM_GEOCODING_URL ||
			'https://nominatim.openstreetmap.org/',
		private readonly userAgent = process.env.NOMINATIM_USER_AGENT ||
			'DeliveryCruzeiro/1.2 (delivery address geocoding)'
	) {
		this.cacheKey = `nominatim:v1:${baseUrl}`;
	}

	private match(places: NominatimPlace[], address: GeocodingAddress): GeocodingResult {
		const points: GeocodingPoint[] = [];
		for (const place of places) {
			const p = place?.address;
			if (
				!p ||
				comparable(p.country_code) !== 'br' ||
				comparable(p.city ?? p.town ?? p.village ?? p.municipality) !==
					comparable(address.city) ||
				houseNumber(p.house_number) !== houseNumber(address.number) ||
				streetName(p.road ?? p.pedestrian ?? p.residential) !== streetName(address.street)
			)
				continue;
			if (
				p.postcode &&
				normalizeZipCode(String(p.postcode)) !== normalizeZipCode(address.zipCode)
			)
				continue;
			const state = address.state.trim().toUpperCase();
			if (
				p['ISO3166-2-lvl4'] &&
				comparable(p['ISO3166-2-lvl4']) !== comparable(`BR-${state}`)
			)
				continue;
			if (
				!p['ISO3166-2-lvl4'] &&
				p.state &&
				![comparable(state), comparable(states[state])].includes(comparable(p.state))
			)
				continue;
			if (
				(typeof place.lat !== 'string' && typeof place.lat !== 'number') ||
				(typeof place.lon !== 'string' && typeof place.lon !== 'number') ||
				String(place.lat).trim() === '' ||
				String(place.lon).trim() === ''
			)
				continue;
			const latitude = Number(place.lat),
				longitude = Number(place.lon);
			if (
				!Number.isFinite(latitude) ||
				!Number.isFinite(longitude) ||
				longitude < -74 ||
				longitude > -34 ||
				latitude < -34 ||
				latitude > 6
			)
				continue;
			points.push({ latitude, longitude });
		}
		if (!points.length) return { status: 'not_found' };
		if (
			points.some(
				p =>
					Math.hypot(p.longitude - points[0].longitude, p.latitude - points[0].latitude) >
					0.0002
			)
		)
			return { status: 'ambiguous' };
		return { status: 'found', point: points[0], source:'NOMINATIM', sourceVersion:this.cacheKey };
	}

	async locate(address: GeocodingAddress): Promise<GeocodingResult> {
		const zipCode = normalizeZipCode(address.zipCode);
		if (
			zipCode.length !== 8 ||
			!address.street.trim() ||
			!/\d/.test(address.number) ||
			!address.city.trim() ||
			!states[address.state.trim().toUpperCase()]
		)
			return { status: 'invalid_address' };
		const key = createHash('sha256')
			.update(
				JSON.stringify([
					zipCode,
					houseNumber(address.number),
					streetName(address.street),
					comparable(address.city),
					comparable(address.state),
				])
			)
			.digest('hex');
		const cached = this.cache.get(key);
		if (cached && cached.expires > Date.now()) return cached.result;
		const pending = this.pending.get(key);
		if (pending) return pending;
		const task = this.request(address, zipCode).then(result => {
			if (result.status !== 'unavailable') {
				if (this.cache.size >= 1000) this.cache.delete(this.cache.keys().next().value!);
				this.cache.set(key, {
					result,
					expires: Date.now() + (result.status === 'found' ? 86400000 : 300000),
				});
			}
			return result;
		});
		this.pending.set(key, task);
		try {
			return await task;
		} finally {
			this.pending.delete(key);
		}
	}

	private async request(address: GeocodingAddress, zipCode: string): Promise<GeocodingResult> {
		let url: URL;
		try {
			url = new URL('search', this.baseUrl.replace(/\/?$/, '/'));
			if (url.protocol !== 'https:') return { status: 'unavailable' };
		} catch {
			return { status: 'unavailable' };
		}
		url.search = new URLSearchParams({
			format: 'jsonv2',
			addressdetails: '1',
			limit: '10',
			countrycodes: 'br',
			street: `${address.number} ${address.street}`,
			city: address.city,
			state: states[address.state.trim().toUpperCase()],
			postalcode: `${zipCode.slice(0, 5)}-${zipCode.slice(5)}`,
		}).toString();
		for (let attempt = 0; attempt < 2; attempt++) {
			try {
				const response = await this.queue.run(async signal => {
					const res = await this.fetcher(url, {
						headers: {
							accept: 'application/json',
							'user-agent': this.userAgent,
							'accept-language': 'pt-BR,pt;q=0.9',
						},
						signal: AbortSignal.any([signal, AbortSignal.timeout(8000)]),
						redirect: 'error',
					});
					// Reading the complete body belongs to the exclusive job, not outside it.
					const body = await res.text();
					const data: unknown = res.ok ? JSON.parse(body) : null;
					return { ok: res.ok, status: res.status, data };
				});
				if (!response.ok) {
					if (response.status >= 500 && attempt === 0) continue;
					return { status: 'unavailable' };
				}
				if (!Array.isArray(response.data)) return { status: 'unavailable' };
				return this.match(response.data, address);
			} catch {
				if (attempt === 1) return { status: 'unavailable' };
			}
		}
		return { status: 'unavailable' };
	}
}

// All checkout/service instances share cache, deduplication and the global queue.
export const nominatimGeocodingProvider = new NominatimGeocodingProvider();

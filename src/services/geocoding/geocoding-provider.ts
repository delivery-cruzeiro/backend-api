export type GeocodingAddress = {
	street: string;
	number: string;
	zipCode: string;
	city: string;
	state: string;
	neighborhood: string;
};

export type GeocodingPoint = { latitude: number; longitude: number };

export type GeocodingQuality = {
	uncertaintyMeters: number;
	levels: number[];
	records: number;
	distinctPoints: number;
	spreadMeters: number;
};
export type FoundGeocodingResult = {
	status: 'found';
	point: GeocodingPoint;
	source?: string;
	sourceVersion?: string;
	precision?: 'address' | 'suburb';
	quality?: GeocodingQuality;
};
export type GeocodingOptions = {
	acceptResult?: (result: FoundGeocodingResult) => Promise<boolean>;
};
export type GeocodingResult =
	| FoundGeocodingResult
	| { status: 'not_found' | 'ambiguous' | 'unavailable' | 'invalid_address' };

export interface GeocodingProvider {
	/** Include provider configuration and matching version to invalidate old results. */
	readonly cacheKey: string;
	cacheKeyFor?(address: GeocodingAddress): Promise<string>;
	locate(address: GeocodingAddress, options?: GeocodingOptions): Promise<GeocodingResult>;
}

export const comparable = (value: unknown): string =>
	typeof value === 'string'
		? value
				.normalize('NFD')
				.replace(/[\u0300-\u036f]/g, '')
				.replace(/[^a-z0-9]+/gi, ' ')
				.trim()
				.toLowerCase()
		: '';

export const houseNumber = (value: unknown): string => comparable(value).replace(/^0+(?=\d)/, '');
export const geocodingStreetKey = (value: unknown): string =>
	comparable(value).replace(/^(rua|r|avenida|av|travessa|tv|alameda|al) /, '');

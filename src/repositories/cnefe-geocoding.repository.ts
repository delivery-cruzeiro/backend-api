import { prisma } from '../lib/prisma.js';
import { normalizeZipCode } from '../services/via-cep.service.js';
import {
	comparable,
	geocodingStreetKey,
	houseNumber,
	type GeocodingAddress,
} from '../services/geocoding/geocoding-provider.js';

export class CnefeGeocodingRepository {
	findDataset(address: GeocodingAddress) {
		return prisma.cnefeDataset.findFirst({
			where: {
				cityKey: comparable(address.city),
				state: address.state.trim().toUpperCase(),
				active: true,
			},
			select: { id: true, version: true, checksum: true },
		});
	}

	findCandidates(datasetId: string, address: GeocodingAddress) {
		// Collapse apartment/unit duplicates in the database, with a bounded result.
		return prisma.cnefeAddress.groupBy({
			by: ['latitude', 'longitude', 'geoLevel'],
			where: {
				datasetId,
				zipCode: normalizeZipCode(address.zipCode),
				streetKey: geocodingStreetKey(address.street),
				numberKey: houseNumber(address.number),
				geoLevel: { in: [1, 2] },
			},
			_count: { _all: true },
			orderBy: [{ geoLevel: 'asc' }, { latitude: 'asc' }, { longitude: 'asc' }],
			take: 65,
		});
	}
}

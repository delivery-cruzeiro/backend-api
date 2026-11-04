// Read-only, bounded audit. Never prints customers' address fields or identifiers.
import { prisma, disconnectPrisma } from '../dist/lib/prisma.js';
import { nominatimGeocodingProvider } from '../dist/services/geocoding/nominatim-geocoding.provider.js';
import { closeNominatimQueue } from '../dist/lib/nominatim-request-queue.js';
import { deliveryGeometryCovers, normalizeDeliveryName } from '@delivery-cruzeiro/types';

try {
  const partitions = await prisma.deliveryPartition.findMany({ include: {
    neighborhood: true, revisions: { include: { areas: true } },
  } });
  const provider = nominatimGeocodingProvider;
  for (const partition of partitions) {
    const ref = partition.neighborhood;
    const areas = partition.revisions.filter(r => r.revision === partition.activeRevision).flatMap(r => r.areas);
    const addresses = await prisma.address.findMany({ where: {
      city: { equals: ref.city, mode: 'insensitive' }, state: { equals: ref.state, mode: 'insensitive' },
    }, select: { street: true, number: true, zipCode: true, city: true, state: true,
      neighborhood: true, locationConfirmed: true, latitude: true, longitude: true, geocodingAttemptedAt: true },
    });
    const matching = addresses.filter(a => normalizeDeliveryName(a.neighborhood) === normalizeDeliveryName(ref.name));
    console.log(JSON.stringify({ neighborhood: ref.name, city: ref.city, activeAreas: areas.map(a => a.name),
      addresses: matching.length, confirmed: matching.filter(a => a.locationConfirmed).length,
      attempted: matching.filter(a => a.geocodingAttemptedAt).length }));
    for (const [i, address] of matching.slice(0, 4).entries()) {
      const result = await provider.locate(address);
      console.log(JSON.stringify({ sample: i + 1, status: result.status,
        ...(result.status === 'found' ? { areas: areas.filter(a => deliveryGeometryCovers(a.geometry,
          [result.point.longitude, result.point.latitude])).map(a => a.name) } : {}) }));
    }
  }
} finally { await closeNominatimQueue(); await disconnectPrisma(); }

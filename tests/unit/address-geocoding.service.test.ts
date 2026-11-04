import { beforeEach, describe, expect, it, vi } from 'vitest';
const database = vi.hoisted(() => ({ findUnique: vi.fn(), updateMany: vi.fn() }));
vi.mock('../../src/lib/prisma.js', () => ({ prisma: { address: database } }));
import { AddressGeocodingService } from '../../src/services/address-geocoding.service.js';
const address = {
	id: 'address',
	street: 'Rua Exemplo',
	number: '12',
	city: 'Campina Grande',
	state: 'PB',
	neighborhood: 'Liberdade',
	zipCode: '58414-000',
	updatedAt: new Date(),
	geocodingKey: null,
	geocodingAttemptedAt: null,
	latitude: null,
	longitude: null,
	locationConfirmed: false,
};
const found = { status: 'found' as const, point: { longitude: -35.88, latitude: -7.24 } };
function setup() {
	const locate = vi.fn().mockResolvedValue(found);
	return {
		locate,
		service: new AddressGeocodingService({ cacheKey: 'nominatim:v1:test', locate }),
	};
}
describe('automatic address location persistence', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		database.findUnique.mockResolvedValue(address);
		database.updateMany.mockResolvedValue({ count: 1 });
	});
	it('persists and reuses a verified point between quotation and order', async () => {
		const { service, locate } = setup();
		expect(await service.ensureLocation(address.id)).toMatchObject({
			locationConfirmed: true,
			...found.point,
		});
		database.findUnique.mockResolvedValue({
			...address,
			...database.updateMany.mock.calls[0][0].data,
		});
		await service.ensureLocation(address.id);
		expect(locate).toHaveBeenCalledTimes(1);
	});
	it('invalidates the location when address or provider version changes', async () => {
		const { service, locate } = setup();
		await service.ensureLocation(address.id);
		const saved = database.updateMany.mock.calls[0][0].data;
		database.findUnique.mockResolvedValue({ ...address, ...saved, number: '15' });
		await service.ensureLocation(address.id);
		expect(locate).toHaveBeenCalledTimes(2);
		database.findUnique.mockResolvedValue({
			...address,
			...saved,
			geocodingKey: 'old-photon-key',
		});
		await service.ensureLocation(address.id);
		expect(locate).toHaveBeenCalledTimes(3);
	});
	it('caches missing coverage but not temporary outages', async () => {
		const { service, locate } = setup();
		locate.mockResolvedValueOnce({ status: 'not_found' });
		await service.ensureLocation(address.id);
		database.findUnique.mockResolvedValue({
			...address,
			...database.updateMany.mock.calls[0][0].data,
		});
		await service.ensureLocation(address.id);
		expect(locate).toHaveBeenCalledTimes(1);
		database.findUnique.mockResolvedValue(address);
		database.updateMany.mockClear();
		locate.mockResolvedValueOnce({ status: 'unavailable' });
		expect(await service.ensureLocation(address.id)).toMatchObject({
			locationConfirmed: false,
		});
		expect(database.updateMany).not.toHaveBeenCalled();
		expect(await service.ensureLocation(address.id)).toMatchObject({ locationConfirmed: true });
	});
	it('never overwrites a concurrent address edit', async () => {
		const { service } = setup();
		database.updateMany.mockResolvedValue({ count: 0 });
		expect(await service.ensureLocation(address.id)).toEqual({
			latitude: null,
			longitude: null,
			locationConfirmed: false,
		});
	});
	it('deduplicates simultaneous quotation and order requests', async () => {
		const { service, locate } = setup();
		const results = await Promise.all([
			service.ensureLocation(address.id),
			service.ensureLocation(address.id),
		]);
		expect(results.every(r => r.locationConfirmed)).toBe(true);
		expect(locate).toHaveBeenCalledTimes(1);
		expect(database.updateMany).toHaveBeenCalledTimes(1);
	});
	it('handles provider exceptions and unknown addresses safely', async () => {
		const { service, locate } = setup();
		locate.mockRejectedValue(new Error('offline'));
		expect(await service.ensureLocation(address.id)).toMatchObject({
			locationConfirmed: false,
		});
		expect(database.updateMany).not.toHaveBeenCalled();
		database.findUnique.mockResolvedValue(null);
		expect(await service.ensureLocation('missing')).toMatchObject({ locationConfirmed: false });
	});
});
describe('source quality and store-scoped location validation', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		database.findUnique.mockResolvedValue(address);
		database.updateMany.mockResolvedValue({ count: 1 });
	});
	it('persists source/version/uncertainty and validates a cached point against the current store map', async () => {
		const quality = {
			uncertaintyMeters: 44,
			levels: [1, 2],
			records: 101,
			distinctPoints: 2,
			spreadMeters: 13.4,
		};
		const locate = vi
			.fn()
			.mockResolvedValue({
				...found,
				source: 'IBGE_CNEFE',
				sourceVersion: '2022:abc',
				quality,
			});
		const provider = {
			cacheKey: 'test',
			cacheKeyFor: vi.fn().mockResolvedValue('test:dataset-abc'),
			locate,
		};
		const service = new AddressGeocodingService(provider),
			accept = vi.fn().mockResolvedValue(true);
		expect(
			await service.ensureLocation(address.id, { scope: 'store:one', accept })
		).toMatchObject({ locationAccuracyMeters: 44 });
		const saved = database.updateMany.mock.calls[0][0].data;
		expect(saved).toMatchObject({
			geocodingSource: 'IBGE_CNEFE',
			geocodingSourceVersion: '2022:abc',
			geocodingQuality: quality,
		});
		expect(saved).not.toHaveProperty('locationAccuracyMeters');
		database.findUnique.mockResolvedValue({ ...address, ...saved });
		await service.ensureLocation(address.id, { scope: 'store:one', accept });
		expect(locate).toHaveBeenCalledTimes(1);
		provider.cacheKeyFor.mockResolvedValue('test:dataset-new');
		await service.ensureLocation(address.id, { scope: 'store:one', accept });
		expect(locate).toHaveBeenCalledTimes(2);
		expect(accept).toHaveBeenCalled();
	});
	it('does not reuse a negative area decision across different stores', async () => {
		const { service, locate } = setup();
		locate.mockResolvedValue({ status: 'not_found' });
		await service.ensureLocation(address.id, { scope: 'store:one' });
		database.findUnique.mockResolvedValue({
			...address,
			...database.updateMany.mock.calls[0][0].data,
		});
		await service.ensureLocation(address.id, { scope: 'store:two' });
		expect(locate).toHaveBeenCalledTimes(2);
	});
	it('never persists a found point that the delivery map rejects', async () => {
		const { service } = setup();
		expect(
			await service.ensureLocation(address.id, { accept: async () => false })
		).toMatchObject({ locationConfirmed: false });
		expect(database.updateMany.mock.calls[0][0].data).toMatchObject({
			latitude: null,
			longitude: null,
			geocodingSource: null,
		});
	});
});

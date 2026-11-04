import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
	resolve: vi.fn(),
	ensureLocation: vi.fn(),
	upsert: vi.fn(),
	findMany: vi.fn(),
}));
vi.mock('../../src/lib/prisma.js', () => ({
	prisma: {
		storeShipping: { upsert: mocks.upsert },
		storeNeighborhoodShipping: { findMany: mocks.findMany },
	},
}));
vi.mock('../../src/services/delivery-area.service.js', () => ({
	DeliveryAreaService: class {
		resolve = mocks.resolve;
	},
	assertShippingStore: vi.fn(),
}));
vi.mock('../../src/services/address-geocoding.service.js', () => ({
	AddressGeocodingService: class {
		ensureLocation = mocks.ensureLocation;
	},
}));
import { StoreShippingService } from '../../src/services/store-shipping.service.js';

const input = {
	storeId: 'store',
	addressId: 'address',
	neighborhood: 'Liberdade',
	city: 'Campina Grande',
	state: 'PB',
};

describe('shipping geocoding dependency', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mocks.upsert.mockResolvedValue({ value: 8, shippingTime: 30 });
		mocks.findMany.mockResolvedValue([]);
	});
	it('does not consult the provider for an undivided neighborhood', async () => {
		mocks.resolve.mockResolvedValue(null);
		expect(await new StoreShippingService().resolveShippingQuote(input)).toMatchObject({
			isAvailable: true,
			value: 8,
		});
		expect(mocks.ensureLocation).not.toHaveBeenCalled();
	});
	it("locates a divided neighborhood and applies that area's price", async () => {
		const point = { longitude: -35.89, latitude: -7.24, locationConfirmed: true };
		mocks.resolve.mockResolvedValueOnce({ needsLocation: true }).mockResolvedValueOnce({
			needsLocation: false,
			boundary: false,
			area: {
				id: 'area-two',
				name: 'Liberdade-2',
				revisionNumber: 1,
				rule: { id: 'rule', mode: 'MANUAL', value: 12, shippingTime: 40, isBlocked: false },
			},
		});
		mocks.ensureLocation.mockResolvedValue(point);
		expect(await new StoreShippingService().resolveShippingQuote(input)).toMatchObject({
			isAvailable: true,
			value: 12,
			areaId: 'area-two',
			areaSnapshot: { value: 12, shippingTime: 40 },
		});
		expect(mocks.resolve).toHaveBeenLastCalledWith({ ...input, ...point });
	});
	it('never substitutes the default price when the divided area is unknown', async () => {
		mocks.resolve.mockResolvedValue({ needsLocation: true });
		mocks.ensureLocation.mockResolvedValue({
			longitude: null,
			latitude: null,
			locationConfirmed: false,
		});
		const quote = await new StoreShippingService().resolveShippingQuote(input);
		expect(quote).toMatchObject({ isAvailable: false, needsLocation: true, value: 0 });
		expect(quote.message).not.toContain('Confira');
	});
	it('preserves administrative skipAreas without an external lookup', async () => {
		expect(
			await new StoreShippingService().resolveShippingQuote({ ...input, skipAreas: true })
		).toMatchObject({ isAvailable: true, value: 8 });
		expect(mocks.resolve).not.toHaveBeenCalled();
		expect(mocks.ensureLocation).not.toHaveBeenCalled();
	});
});

import { describe, expect, it, vi } from 'vitest';
const db = vi.hoisted(() => ({ findFirst: vi.fn(), groupBy: vi.fn() }));
vi.mock('../../src/lib/prisma.js', () => ({
	prisma: { cnefeDataset: { findFirst: db.findFirst }, cnefeAddress: { groupBy: db.groupBy } },
}));
import { CnefeGeocodingRepository } from '../../src/repositories/cnefe-geocoding.repository.js';
describe('CNEFE exact address lookup', () => {
	it('scopes active city/state and requires postcode, street and house number together', async () => {
		const address = {
			street: 'R. Exémplo',
			number: '0012 A',
			zipCode: '58414-000',
			city: 'Campina Grande',
			state: 'pb',
			neighborhood: 'Liberdade',
		};
		const repo = new CnefeGeocodingRepository();
		await repo.findDataset(address);
		await repo.findCandidates('dataset', address);
		expect(db.findFirst).toHaveBeenCalledWith(
			expect.objectContaining({
				where: { cityKey: 'campina grande', state: 'PB', active: true },
			})
		);
		expect(db.groupBy).toHaveBeenCalledWith(
			expect.objectContaining({
				where: {
					datasetId: 'dataset',
					zipCode: '58414000',
					streetKey: 'exemplo',
					numberKey: '12 a',
					geoLevel: { in: [1, 2] },
				},
				take: 65,
			})
		);
	});
});

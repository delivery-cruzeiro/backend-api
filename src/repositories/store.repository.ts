import { isStoreClosed } from '../services/store-hours.js';
import { prisma } from '../lib/prisma.js';
import { getFiscalCityCode } from '../services/fiscal/shared/fiscal-location-codes.js';

export type StoreOptionRecord = {
	id: string;
	name: string;
	nickname: string;
	isActive: boolean;
	isClosed: boolean;
	layout: 'QUIET_OPS' | 'MOTION_CANVAS' | 'CRAVE_MARKET';
	address: {
		city: string;
		cityCode: string | null;
		complement: string | null;
		id: string;
		latitude: number | null;
		longitude: number | null;
		neighborhood: string;
		number: string;
		state: string;
		street: string;
		zipCode: string;
	};
};

export class StoreRepository {
	async listActiveOptions() {
		const stores = await prisma.store.findMany({
			orderBy: [{ nickname: 'asc' }, { name: 'asc' }],
			select: {
				openHour:true, closeHour:true, businessHours:true,
				address: {
					select: {
						city: true,
						complement: true,
						id: true,
						latitude: true,
						longitude: true,
						neighborhood: true,
						number: true,
						state: true,
						street: true,
						zipCode: true,
					},
				},
				id: true,
				isActive: true,
				layout: true,
				name: true,
				nickname: true,
			},
			where: { isActive: true },
		});

		return stores.map(({openHour,closeHour,businessHours,...store}) => ({
			...store,
			address: {
				...store.address,
				cityCode: getFiscalCityCode(store.address),
			},
			isClosed: isStoreClosed({openHour,closeHour,businessHours}),
		})) satisfies StoreOptionRecord[];
	}

	findActiveById(id: string) {
		return prisma.store.findFirst({
			where: { id, isActive: true },
			select: {
				addressId: true,
				id: true,
				isActive: true,
				name: true,
				nickname: true,
			},
		});
	}

	updateLayout(id: string, layout: 'QUIET_OPS' | 'MOTION_CANVAS' | 'CRAVE_MARKET') {
		return prisma.store.update({
			where: { id },
			data: { layout },
			select: {
				id: true,
				isActive: true,
				layout: true,
				name: true,
				nickname: true,
			},
		});
	}

	countActiveByIds(ids: string[]) {
		return prisma.store.count({
			where: {
				id: { in: ids },
				isActive: true,
			},
		});
	}

	findProductsForStore(productIds: string[], storeId: string) {
		return prisma.product.findMany({
			where: {
				id: { in: productIds },
				isActive: true,
				stores: {
					some: {
						id: storeId,
					},
				},
			},
			select: {
				id: true,
			},
		});
	}
}

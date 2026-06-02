import { prisma } from '../lib/prisma.js';

export type StoreOptionRecord = {
	id: string;
	name: string;
	nickname: string;
	isActive: boolean;
	isClosed: boolean;
};

export class StoreRepository {
	async listActiveOptions() {
		return prisma.$queryRaw<StoreOptionRecord[]>`
			SELECT
				"id"::TEXT AS "id",
				"name",
				"nickname",
				"is_active" AS "isActive",
				is_store_closed("id") AS "isClosed"
			FROM "stores"
			WHERE "is_active" = TRUE
			ORDER BY "nickname" ASC, "name" ASC
		`;
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

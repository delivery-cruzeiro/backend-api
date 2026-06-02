import type { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma.js';
import { buildStoreFilter, storeSummaryListArgs } from '../services/catalog-store.utils.js';

export const menuSelect = {
	id: true,
	name: true,
	description: true,
	imageUrl: true,
	order: true,
	isActive: true,
	createdAt: true,
	updatedAt: true,
	stores: storeSummaryListArgs,
	categories: {
		select: {
			id: true,
			name: true,
			description: true,
			imageUrl: true,
			order: true,
			isActive: true,
			createdAt: true,
			updatedAt: true,
		},
		orderBy: [{ order: 'asc' }, { name: 'asc' }],
	},
	subcategories: {
		select: {
			id: true,
			categoryId: true,
			category: {
				select: {
					id: true,
					name: true,
				},
			},
			name: true,
			description: true,
			imageUrl: true,
			order: true,
			isActive: true,
			createdAt: true,
			updatedAt: true,
		},
		orderBy: [{ order: 'asc' }, { name: 'asc' }],
	},
} satisfies Prisma.MenuSelect;

export type MenuRecord = Prisma.MenuGetPayload<{ select: typeof menuSelect }>;

type MenuMutationData = {
	categoryIds?: string[];
	description?: string;
	imageUrl?: string;
	isActive?: boolean;
	name?: string;
	order?: number;
	storeIds?: string[];
	subcategoryIds?: string[];
};

function buildRelationSet(ids?: string[]) {
	return ids === undefined ? undefined : { set: ids.map(id => ({ id })) };
}

function buildRelationConnect(ids?: string[]) {
	return ids === undefined ? undefined : { connect: ids.map(id => ({ id })) };
}

export class MenuRepository {
	countCategoriesByIds(ids: string[]) {
		return prisma.category.count({ where: { id: { in: ids } } });
	}

	countSubcategoriesByIds(ids: string[]) {
		return prisma.subcategory.count({ where: { id: { in: ids } } });
	}

	create(
		data: Required<Pick<MenuMutationData, 'isActive' | 'name' | 'order'>> & MenuMutationData
	) {
		return prisma.menu.create({
			data: {
				description: data.description,
				imageUrl: data.imageUrl,
				isActive: data.isActive,
				name: data.name,
				order: data.order,
				categories: buildRelationConnect(data.categoryIds),
				stores: buildRelationConnect(data.storeIds),
				subcategories: buildRelationConnect(data.subcategoryIds),
			},
			select: menuSelect,
		});
	}

	delete(id: string) {
		return prisma.menu.delete({ where: { id } });
	}

	findById(id: string) {
		return prisma.menu.findUnique({
			where: { id },
			select: menuSelect,
		});
	}

	findByName(name: string) {
		return prisma.menu.findUnique({
			where: { name },
			select: { id: true },
		});
	}

	list(storeId?: string) {
		return prisma.menu.findMany({
			where: buildStoreFilter(storeId),
			select: menuSelect,
			orderBy: [{ order: 'asc' }, { name: 'asc' }],
		});
	}

	update(id: string, data: MenuMutationData) {
		return prisma.menu.update({
			where: { id },
			data: {
				...(data.description !== undefined && { description: data.description }),
				...(data.imageUrl !== undefined && { imageUrl: data.imageUrl }),
				...(data.isActive !== undefined && { isActive: data.isActive }),
				...(data.name !== undefined && { name: data.name }),
				...(data.order !== undefined && { order: data.order }),
				...(data.categoryIds !== undefined && {
					categories: buildRelationSet(data.categoryIds),
				}),
				...(data.storeIds !== undefined && {
					stores: buildRelationSet(data.storeIds),
				}),
				...(data.subcategoryIds !== undefined && {
					subcategories: buildRelationSet(data.subcategoryIds),
				}),
			},
			select: menuSelect,
		});
	}
}

import type { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma.js';
import { buildStoreFilter, storeSummaryListArgs } from '../services/catalog-store.utils.js';

export const subcategorySelect = {
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
	stores: storeSummaryListArgs,
} satisfies Prisma.SubcategorySelect;

export type SubcategoryRecord = Prisma.SubcategoryGetPayload<{ select: typeof subcategorySelect }>;

type SubcategoryMutationData = {
	categoryId?: string;
	description?: string;
	imageUrl?: string;
	isActive?: boolean;
	name?: string;
	order?: number;
	storeIds?: string[];
};

function buildRelationConnect(ids?: string[]) {
	return ids === undefined ? undefined : { connect: ids.map(id => ({ id })) };
}

function buildRelationSet(ids?: string[]) {
	return ids === undefined ? undefined : { set: ids.map(id => ({ id })) };
}

export class SubcategoryRepository {
	create(
		data: Required<
			Pick<SubcategoryMutationData, 'categoryId' | 'isActive' | 'name' | 'order'>
		> &
			SubcategoryMutationData
	) {
		return prisma.subcategory.create({
			data: {
				categoryId: data.categoryId,
				description: data.description,
				imageUrl: data.imageUrl,
				isActive: data.isActive,
				name: data.name,
				order: data.order,
				stores: buildRelationConnect(data.storeIds),
			},
			select: subcategorySelect,
		});
	}

	delete(id: string) {
		return prisma.subcategory.delete({ where: { id } });
	}

	findByCategoryAndName(categoryId: string, name: string) {
		return prisma.subcategory.findUnique({
			where: { categoryId_name: { categoryId, name } },
			select: { id: true },
		});
	}

	findById(id: string) {
		return prisma.subcategory.findUnique({
			where: { id },
			select: subcategorySelect,
		});
	}

	findCategoryById(id: string) {
		return prisma.category.findUnique({
			where: { id },
			select: { id: true },
		});
	}

	list(storeId?: string) {
		return prisma.subcategory.findMany({
			where: buildStoreFilter(storeId),
			select: subcategorySelect,
			orderBy: [{ category: { order: 'asc' } }, { order: 'asc' }, { name: 'asc' }],
		});
	}

	update(id: string, data: SubcategoryMutationData) {
		const { storeIds, ...subcategoryData } = data;

		return prisma.subcategory.update({
			where: { id },
			data: {
				...subcategoryData,
				stores: buildRelationSet(storeIds),
			},
			select: subcategorySelect,
		});
	}
}

import type { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma.js';

export const storeSummarySelect = {
	id: true,
	name: true,
	nickname: true,
	isActive: true,
} as const;

export const storeSummaryOrderBy: Prisma.StoreOrderByWithRelationInput[] = [
	{ nickname: 'asc' },
	{ name: 'asc' },
];

export const storeSummaryListArgs = {
	select: storeSummarySelect,
	orderBy: storeSummaryOrderBy,
};

export function normalizeStoreIds(storeIds?: string[]) {
	return [...new Set(storeIds ?? [])];
}

export async function ensureActiveStoresExist(storeIds?: string[]) {
	const uniqueStoreIds = normalizeStoreIds(storeIds);

	if (uniqueStoreIds.length === 0) {
		throw new Error('Selecione ao menos uma loja');
	}

	const storesCount = await prisma.store.count({
		where: {
			id: { in: uniqueStoreIds },
			isActive: true,
		},
	});

	if (storesCount !== uniqueStoreIds.length) {
		throw new Error('Loja nao encontrada');
	}
}

export function buildStoreConnect(storeIds?: string[]) {
	return storeIds === undefined
		? undefined
		: { connect: normalizeStoreIds(storeIds).map(id => ({ id })) };
}

export function buildStoreSet(storeIds?: string[]) {
	return storeIds === undefined
		? undefined
		: { set: normalizeStoreIds(storeIds).map(id => ({ id })) };
}

export function buildStoreFilter(storeId?: string) {
	return storeId ? { stores: { some: { id: storeId } } } : undefined;
}

export function getStoreIdQuery(requestQuery: unknown) {
	if (!requestQuery || typeof requestQuery !== 'object') {
		return undefined;
	}

	const storeId = (requestQuery as { storeId?: unknown }).storeId;

	return typeof storeId === 'string' && storeId.trim() ? storeId.trim() : undefined;
}

export function getStoreValidationStatus(message: string) {
	if (message.includes('Selecione')) {
		return 400;
	}

	if (message.includes('nao encontrada') || message.includes('nao encontrado')) {
		return 404;
	}

	return 500;
}

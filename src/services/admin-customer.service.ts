import {
	UserRole,
	type AdminCustomerSearchDTO,
	type AdminCustomerSearchResponse,
	type UserGender,
} from '@delivery-cruzeiro/types';
import type { Prisma } from '@prisma/client';
import { brasiliaDateRange } from '../lib/brasilia-date-range.js';
import { prisma } from '../lib/prisma.js';

const customerSelect = {
	id: true,
	name: true,
	email: true,
	cpf: true,
	phone: true,
	gender: true,
	avatar: true,
	isActive: true,
	emailVerified: true,
	createdAt: true,
	updatedAt: true,
} as const satisfies Prisma.UserSelect;

const orderBy = [{ name: 'asc' }, { id: 'asc' }] satisfies Prisma.UserOrderByWithRelationInput[];
const phoneSearchBatchSize = 500;

function containsText(value?: string) {
	if (!value) return undefined;
	return { contains: value.replace(/[\\%_]/g, '\\$&'), mode: 'insensitive' as const };
}

function cpfPrefixes(digits: string) {
	const blocks = [digits.slice(0, 3), digits.slice(3, 6), digits.slice(6, 9)];
	const formatted = blocks.filter(Boolean).join('.') + (digits.length > 9 ? `-${digits.slice(9)}` : '');
	return [...new Set([digits, formatted])].map(startsWith => ({ cpf: { startsWith } }));
}

function buildCustomerFilter(query: AdminCustomerSearchDTO): Prisma.UserWhereInput {
	return {
		role: UserRole.CLIENT,
		id: query.id,
		name: containsText(query.name),
		email: containsText(query.email),
		OR: query.cpf ? cpfPrefixes(query.cpf) : undefined,
		gender: query.gender,
		isActive: query.isActive,
		emailVerified: query.emailVerified,
		createdAt: brasiliaDateRange(query.createdFrom, query.createdTo),
		updatedAt: brasiliaDateRange(query.updatedFrom, query.updatedTo),
		...(query.avatar === 'absent' && { AND: [{ OR: [{ avatar: null }, { avatar: '' }] }] }),
		...(query.avatar === 'present' && { avatar: { not: null, notIn: [''] } }),
		...(query.avatar && query.avatar !== 'present' && query.avatar !== 'absent' && { avatar: query.avatar }),
	};
}

async function findPhonePage(
	database: Prisma.TransactionClient,
	where: Prisma.UserWhereInput,
	phone: string,
	offset: number,
	limit: number,
) {
	// Phones use randomized encryption. The Prisma wrapper decrypts only the selected batch.
	const ids: string[] = [];
	let total = 0;
	let afterId: string | undefined;
	while (true) {
		const batch: { id: string; phone: string | null }[] = await database.user.findMany({
			where: { ...where, phone: { not: null } },
			select: { id: true, phone: true },
			orderBy,
			take: phoneSearchBatchSize,
			...(afterId && { cursor: { id: afterId }, skip: 1 }),
		});
		for (const user of batch) {
			if (!user.phone?.replace(/\D/g, '').includes(phone)) continue;
			if (total >= offset && ids.length < limit) ids.push(user.id);
			total++;
		}
		if (batch.length < phoneSearchBatchSize) break;
		afterId = batch[batch.length - 1].id;
	}

	const customers = ids.length ? await database.user.findMany({
		where: { ...where, id: { in: ids } }, select: customerSelect, orderBy,
	}) : [];
	return { customers, total };
}

export async function searchAdminCustomers(query: AdminCustomerSearchDTO): Promise<AdminCustomerSearchResponse> {
	const where = buildCustomerFilter(query);
	const { page, pageSize, phone } = query;
	const skip = (page - 1) * pageSize;
	const { customers, total } = await prisma.$transaction(async database => {
		if (phone) return findPhonePage(database, where, phone, skip, pageSize);

		const total = await database.user.count({ where });
		const customers = await database.user.findMany({ where, select: customerSelect, orderBy, skip, take: pageSize });
		return { customers, total };
	});
	return {
		customers: customers.map(customer => ({
			...customer,
			gender: customer.gender as UserGender | null,
			role: UserRole.CLIENT,
			createdAt: customer.createdAt.toISOString(),
			updatedAt: customer.updatedAt.toISOString(),
		})),
		total,
		page,
		pageSize,
		totalPages: Math.ceil(total / pageSize),
	};
}

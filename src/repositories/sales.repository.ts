import type { PrismaClient } from '@prisma/client';
import { prisma } from '../lib/prisma.js';

export interface FiscalSaleRecord {
	address: {
		city: string;
		complement: string | null;
		neighborhood: string;
		number: string;
		state: string;
		street: string;
		zipCode: string;
	} | null;
	createdAt: Date;
	deliveryFee: unknown;
	discount: unknown;
	id: string;
	items: Array<{
		id: string;
		price: unknown;
		product: {
			id: string;
			name: string;
		} | null;
		productId: string;
		quantity: number;
	}>;
	notes: string | null;
	orderNumber: number;
	store: {
		address: {
			city: string;
			complement: string | null;
			neighborhood: string;
			number: string;
			state: string;
			street: string;
			zipCode: string;
		};
		cnpj: string | null;
		id: string;
		name: string;
		nickname: string;
		phoneNumber: string | null;
	} | null;
	storeId: string | null;
	subtotal: unknown;
	total: unknown;
	user: {
		email: string;
		name: string;
		phone: string | null;
	} | null;
}

export interface SalesRepository {
	findFiscalSaleById(id: string): Promise<FiscalSaleRecord | null>;
}

export class PrismaSalesRepository implements SalesRepository {
	constructor(private readonly database: PrismaClient = prisma) {}

	async findFiscalSaleById(id: string) {
		return this.database.order.findUnique({
			where: { id },
			select: {
				createdAt: true,
				deliveryFee: true,
				discount: true,
				id: true,
				items: {
					select: {
						id: true,
						price: true,
						product: {
							select: {
								id: true,
								name: true,
							},
						},
						productId: true,
						quantity: true,
					},
				},
				notes: true,
				orderNumber: true,
				storeId: true,
				subtotal: true,
				total: true,
				user: {
					select: {
						email: true,
						name: true,
						phone: true,
					},
				},
				address: {
					select: {
						city: true,
						complement: true,
						neighborhood: true,
						number: true,
						state: true,
						street: true,
						zipCode: true,
					},
				},
				store: {
					select: {
						address: {
							select: {
								city: true,
								complement: true,
								neighborhood: true,
								number: true,
								state: true,
								street: true,
								zipCode: true,
							},
						},
						cnpj: true,
						id: true,
						name: true,
						nickname: true,
						phoneNumber: true,
					},
				},
			},
		});
	}
}

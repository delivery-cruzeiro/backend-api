import { Prisma, type PrismaClient } from '@prisma/client';
import { prisma } from '../lib/prisma.js';

const select = {
	id: true,
	orderNumber: true,
	status: true,
	storeId: true,
	total: true,
	subtotal: true,
	deliveryFee: true,
	discount: true,
	paymentAdditionalValue: true,
	address: true,
	fiscalRecipient: true,
	paymentType: true,
	paymentMethod: { select: { type: true } },
	storePaymentMethod: { select: { type: true } },
	payments: { select: { status: true, amount: true } },
	items: {
		orderBy: { id: 'asc' },
		select: {
			id: true,
			productId: true,
			quantity: true,
			price: true,
			product: {
				select: {
					name: true,
					fiscalData: true,
					fiscalOperation: { include: { classification: true } },
					category: {
						select: {
							fiscalData: true,
							fiscalOperation: { include: { classification: true } },
						},
					},
				},
			},
		},
	},
	store: {
		select: {
			id: true,
			cnpj: true,
			name: true,
			nickname: true,
			phoneNumber: true,
			address: true,
			fiscalProfile: true,
		},
	},
	user: { select: { cpf: true, name: true } },
} satisfies Prisma.OrderSelect;

export type FiscalSaleRecord = Prisma.OrderGetPayload<{ select: typeof select }>;

export interface SalesRepository {
	findFiscalSaleById(id: string): Promise<FiscalSaleRecord | null>;
}

export class PrismaSalesRepository implements SalesRepository {
	constructor(private readonly database: PrismaClient = prisma) {}

	findFiscalSaleById(id: string) {
		return this.database.order.findUnique({ where: { id }, select });
	}
}

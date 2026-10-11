import type { Prisma, PrismaClient } from '@prisma/client';
import { prisma } from '../lib/prisma.js';

const orderWhatsAppDataSelect = {
	id: true,
	paymentType: true,
	storePaymentMethodId: true,
	storePaymentMethod: { select: { name: true } },
	orderNumber: true,
	status: true,
	total: true,
	user: {
		select: {
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
		select: { name: true },
	},
	items: {
		select: {
			quantity: true,
			product: { select: { name: true } },
		},
	},
} satisfies Prisma.OrderSelect;

export type OrderWhatsAppDataRecord = Prisma.OrderGetPayload<{
	select: typeof orderWhatsAppDataSelect;
}>;

export interface OrderWhatsAppRepository {
	findMessageData(orderId: string): Promise<OrderWhatsAppDataRecord | null>;
}

export class PrismaOrderWhatsAppRepository implements OrderWhatsAppRepository {
	constructor(private readonly database: PrismaClient = prisma) {}

	findMessageData(orderId: string) {
		return this.database.order.findUnique({
			where: { id: orderId },
			select: orderWhatsAppDataSelect,
		});
	}
}

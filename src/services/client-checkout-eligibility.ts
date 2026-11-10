import type { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma.js';

export class CheckoutEmailConfirmationRequired extends Error {
	readonly code = 'EMAIL_CONFIRMATION_REQUIRED';

	constructor(action: 'order' | 'coupon') {
		super(action === 'coupon'
			? 'Confirme seu e-mail para aplicar cupons de desconto.'
			: 'Confirme seu e-mail para realizar outro pedido.');
	}
}

export async function getCheckoutEligibility(userId: string, database: Prisma.TransactionClient = prisma) {
	const user = await database.user.findUnique({
		where: { id: userId },
		select: { emailVerified: true, orders: { take: 1, select: { id: true } } },
	});
	return {
		emailVerified: user?.emailVerified ?? false,
		canPlaceOrder: Boolean(user && (user.emailVerified || user.orders.length === 0)),
	};
}

export async function assertCheckoutEligibility(
	database: Prisma.TransactionClient, userId: string, hasCoupon: boolean
) {
	const eligibility = await getCheckoutEligibility(userId, database);
	if (!eligibility.canPlaceOrder) throw new CheckoutEmailConfirmationRequired('order');
	if (hasCoupon && !eligibility.emailVerified) throw new CheckoutEmailConfirmationRequired('coupon');
}

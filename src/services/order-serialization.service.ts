import {
	OrderStatus,
	PaymentCardType,
	PaymentType,
	type AdminOrder,
} from '@delivery-cruzeiro/types';
import type {
	AdminOrderRecord,
	ClientOrderRecord,
} from '../repositories/order.repository.js';

export function serializeAdminOrder(order: AdminOrderRecord): AdminOrder {
	return {
		...order,
		deliveryFee: Number(order.deliveryFee),
		discount: Number(order.discount),
		items: order.items.map(item => ({
			...item,
			price: Number(item.price),
		})),
		paymentType: order.paymentType as PaymentType | null,
		paymentMethod: order.paymentMethod
			? {
					...order.paymentMethod,
					cardType: order.paymentMethod.cardType as PaymentCardType | null,
					type: order.paymentMethod.type as PaymentType,
				}
			: null,
		storePaymentMethod: order.storePaymentMethod
			? { ...order.storePaymentMethod, type: order.storePaymentMethod.type as PaymentType }
			: null,
		status: order.status as OrderStatus,
		subtotal: Number(order.subtotal),
		total: Number(order.total),
	};
}

export function serializeClientOrder(order: ClientOrderRecord) {
	return {
		...order,
		deliveryFee: Number(order.deliveryFee),
		discount: Number(order.discount),
		items: order.items.map(item => ({
			...item,
			price: Number(item.price),
		})),
		storePaymentMethod: order.storePaymentMethod
			? { ...order.storePaymentMethod, type: order.storePaymentMethod.type as PaymentType }
			: null,
		status: order.status as OrderStatus,
		subtotal: Number(order.subtotal),
		total: Number(order.total),
	};
}

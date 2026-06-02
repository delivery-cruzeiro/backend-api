import { OrderStatus, type AdminOrder } from '@delivery-cruzeiro/types';
import { describe, expect, it, vi } from 'vitest';
import { OrderEventsEmitter } from '../../src/events/order-events.emitter.js';

const baseDate = new Date('2026-05-08T10:00:00.000Z');

const order = {
	createdAt: baseDate,
	deliveryFee: 0,
	discount: 0,
	id: 'order-1',
	items: [],
	status: OrderStatus.PENDING,
	subtotal: 20,
	total: 20,
	updatedAt: baseDate,
	userId: 'user-1',
} satisfies AdminOrder;

describe('OrderEventsEmitter', () => {
	it('notifica listeners com o payload admin-orders:changed', () => {
		const emitter = new OrderEventsEmitter();
		const listener = vi.fn();
		const payload = {
			action: 'create' as const,
			order,
			status: OrderStatus.PENDING,
		};

		emitter.onOrderChanged(listener);
		emitter.emitOrderChanged(payload);

		expect(listener).toHaveBeenCalledWith(payload);
	});

	it('remove listener ao chamar unsubscribe', () => {
		const emitter = new OrderEventsEmitter();
		const listener = vi.fn();
		const unsubscribe = emitter.onOrderChanged(listener);

		unsubscribe();
		emitter.emitOrderChanged({
			action: 'update',
			order,
			status: OrderStatus.CONFIRMED,
		});

		expect(listener).not.toHaveBeenCalled();
	});
});

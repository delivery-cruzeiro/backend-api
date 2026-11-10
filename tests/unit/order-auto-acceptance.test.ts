import { describe, expect, it, vi } from 'vitest';
import { OrderStatus } from '@delivery-cruzeiro/types';
import { acceptDueOrders } from '../../src/services/order-auto-acceptance.service.js';
import type { prisma } from '../../src/lib/prisma.js';
import type { orderEventsEmitter } from '../../src/events/order-events.emitter.js';

describe('automatic order acceptance', () => {
	it.each([0, 1])('publishes only when a pending order was claimed (%i)', async count => {
		const now = new Date('2026-11-09T12:00:05Z');
		const scheduledAt = new Date('2026-11-09T22:00:00Z');
		const confirmed = {
			id: 'order-1',
			status: OrderStatus.CONFIRMED,
			items: [],
			subtotal: 10,
			total: 10,
			deliveryFee: 0,
			discount: 0,
		};
		const database = {
			order: {
				findMany: vi
					.fn()
					.mockResolvedValue([{ id: 'order-1', scheduledAt, deliveryMinutes: 30 }]),
				updateMany: vi.fn().mockResolvedValue({ count }),
				findUnique: vi.fn().mockResolvedValue(confirmed),
			},
			$transaction: async (callback: (tx: unknown) => Promise<unknown>) => callback(database),
		};
		const events = { emitOrderChanged: vi.fn() };
		await acceptDueOrders(
			now,
			database as unknown as typeof prisma,
			events as unknown as typeof orderEventsEmitter
		);
		expect(database.order.findMany).toHaveBeenCalledWith(
			expect.objectContaining({
				where: { status: OrderStatus.PENDING, autoAcceptAt: { lte: now } },
			})
		);
		expect(database.order.updateMany).toHaveBeenCalledWith(
			expect.objectContaining({
				where: { id: 'order-1', status: OrderStatus.PENDING, autoAcceptAt: { lte: now } },
				data: expect.objectContaining({ confirmedAt: now, estimatedDelivery: scheduledAt }),
			})
		);
		expect(events.emitOrderChanged).toHaveBeenCalledTimes(count);
	});
});

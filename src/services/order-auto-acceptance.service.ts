import { OrderStatus } from '@delivery-cruzeiro/types';
import { prisma } from '../lib/prisma.js';
import { databaseIdentity } from '../security/database-context.js';
import { orderEventsEmitter } from '../events/order-events.emitter.js';
import { adminOrderSelect } from '../repositories/order.repository.js';
import { serializeAdminOrder } from './order-serialization.service.js';

export async function acceptDueOrders(
	now = new Date(),
	database = prisma,
	events = orderEventsEmitter
) {
	return databaseIdentity.run({ kind: 'system' }, async () => {
		const due = await database.order.findMany({
			where: { status: OrderStatus.PENDING, autoAcceptAt: { lte: now } },
			take: 100,
			orderBy: { autoAcceptAt: 'asc' },
			select: { id: true, scheduledAt: true, deliveryMinutes: true },
		});
		for (const order of due) {
			await database
				.$transaction(async tx => {
					// Conditional update prevents duplicate confirmation across workers or a manual cancellation.
					const result = await tx.order.updateMany({
						where: {
							id: order.id,
							status: OrderStatus.PENDING,
							autoAcceptAt: { lte: now },
						},
						data: {
							status: OrderStatus.CONFIRMED,
							confirmedAt: now,
							autoAcceptAt: null,
							estimatedDelivery:
								order.scheduledAt ??
								(order.deliveryMinutes
									? new Date(now.getTime() + order.deliveryMinutes * 60000)
									: null),
						},
					});
					if (!result.count) return;
					const confirmed = await tx.order.findUnique({
						where: { id: order.id },
						select: adminOrderSelect,
					});
					if (confirmed) return serializeAdminOrder(confirmed);
					return undefined;
				})
				.then(confirmed => {
					if (confirmed)
						events.emitOrderChanged({
							action: 'update',
							previousStatus: OrderStatus.PENDING,
							status: OrderStatus.CONFIRMED,
							order: confirmed,
						});
				});
		}
	});
}

export function startOrderAutoAcceptance(onError: (error: unknown) => void) {
	let running = false;
	const tick = async () => {
		if (running) return;
		running = true;
		try {
			await acceptDueOrders();
		} catch (error) {
			onError(error);
		} finally {
			running = false;
		}
	};
	const unsubscribe = orderEventsEmitter.onOrderChanged(event => {
		if (event.action === 'create') void tick();
	});
	const interval = setInterval(() => void tick(), 250);
	interval.unref();
	void tick(); // Recover persisted deadlines after restart.
	return () => {
		clearInterval(interval);
		unsubscribe();
	};
}

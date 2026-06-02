import {
	OrderStatus,
	type ListAdminOrdersQueryDTO,
	type UpdateAdminOrderStatusDTO,
} from '@delivery-cruzeiro/types';
import {
	orderEventsEmitter,
	type OrderChangeEventPublisher,
} from '../events/order-events.emitter.js';
import {
	PrismaAdminOrderRepository,
	type AdminOrderRepository,
} from '../repositories/order.repository.js';
import { serializeAdminOrder } from './order-serialization.service.js';

const hiddenAdminOrderStatuses = [OrderStatus.CANCELLED, OrderStatus.DELIVERED];

export class OrderStatusTransitionError extends Error {
	statusCode = 409;

	constructor(message: string) {
		super(message);
		this.name = 'OrderStatusTransitionError';
	}
}

function isFinalOrderStatus(status: OrderStatus) {
	return hiddenAdminOrderStatuses.includes(status);
}

function assertOrderStatusTransition(currentStatus: OrderStatus, nextStatus: OrderStatus) {
	if (isFinalOrderStatus(currentStatus)) {
		throw new OrderStatusTransitionError(
			'Pedidos cancelados ou entregues nao podem ter o status modificado'
		);
	}

	if (nextStatus === OrderStatus.CANCELLED && currentStatus !== OrderStatus.PENDING) {
		throw new OrderStatusTransitionError('Apenas pedidos pendentes podem ser cancelados');
	}

	if (nextStatus === OrderStatus.DELIVERED && currentStatus !== OrderStatus.ON_THE_WAY) {
		throw new OrderStatusTransitionError('Apenas pedidos a caminho podem ser entregues');
	}
}

export class AdminOrderService {
	constructor(
		private readonly orderRepository: AdminOrderRepository = new PrismaAdminOrderRepository(),
		private readonly orderEvents: OrderChangeEventPublisher = orderEventsEmitter
	) {}

	async listOrders(query: ListAdminOrdersQueryDTO) {
		const filters = {
			excludedStatuses:
				!query.status || query.status === 'ALL' ? hiddenAdminOrderStatuses : undefined,
			status: query.status && query.status !== 'ALL' ? query.status : undefined,
			...(query.storeId && { storeId: query.storeId }),
		};
		const orders = await this.orderRepository.findMany(filters);

		return {
			orders: orders.map(order => serializeAdminOrder(order)),
			total: orders.length,
		};
	}

	async updateOrderStatus(id: string, dto: UpdateAdminOrderStatusDTO) {
		const currentOrder = await this.orderRepository.findById(id);

		if (!currentOrder) {
			return null;
		}

		assertOrderStatusTransition(currentOrder.status as OrderStatus, dto.status);

		const order = await this.orderRepository.updateStatus(id, dto.status);

		if (!order) {
			return null;
		}

		const serializedOrder = serializeAdminOrder(order);

		this.orderEvents.emitOrderChanged({
			action: 'update',
			order: serializedOrder,
			status: serializedOrder.status,
		});

		return serializedOrder;
	}
}

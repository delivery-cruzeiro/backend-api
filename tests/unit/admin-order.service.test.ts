import { OrderStatus } from '@delivery-cruzeiro/types';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
	AdminOrderService,
	OrderStatusTransitionError,
} from '../../src/services/admin-order.service.js';
import type { OrderChangeEventPublisher } from '../../src/events/order-events.emitter.js';
import type {
	AdminOrderRecord,
	AdminOrderRepository,
} from '../../src/repositories/order.repository.js';

const baseDate = new Date('2026-05-08T10:00:00.000Z');

function createOrderRecord(overrides: Partial<AdminOrderRecord> = {}): AdminOrderRecord {
	return {
		id: 'order-1',
		userId: 'user-1',
		user: {
			email: 'cliente@example.com',
			id: 'user-1',
			name: 'Cliente Teste',
			phone: '11999999999',
		},
		addressId: 'address-1',
		address: {
			city: 'Cruzeiro',
			complement: null,
			createdAt: baseDate,
			id: 'address-1',
			isDefault: true,
			latitude: null,
			longitude: null,
			neighborhood: 'Centro',
			number: '10',
			state: 'SP',
			street: 'Rua A',
			updatedAt: baseDate,
			userId: 'user-1',
			zipCode: '12700000',
		},
		paymentMethodId: 'payment-1',
		status: OrderStatus.PENDING,
		subtotal: 20,
		deliveryFee: 5,
		discount: 0,
		total: 25,
		notes: 'Sem cebola',
		estimatedDelivery: null,
		deliveredAt: null,
		createdAt: baseDate,
		updatedAt: baseDate,
		items: [
			{
				id: 'item-1',
				orderId: 'order-1',
				productId: 'product-1',
				product: {
					id: 'product-1',
					imageUrl: null,
					name: 'Pizza',
				},
				quantity: 2,
				price: 10,
				notes: null,
			},
		],
		...overrides,
	} as unknown as AdminOrderRecord;
}

describe('AdminOrderService', () => {
	let orderEvents: OrderChangeEventPublisher;
	let repository: AdminOrderRepository;

	beforeEach(() => {
		orderEvents = {
			emitOrderChanged: vi.fn(),
		};
		repository = {
			findById: vi.fn(),
			findMany: vi.fn(),
			updateStatus: vi.fn(),
		};
	});

	it('lista pedidos admin filtrando por status quando informado', async () => {
		const order = createOrderRecord({ status: OrderStatus.PREPARING });
		vi.mocked(repository.findMany).mockResolvedValue([order]);
		const service = new AdminOrderService(repository, orderEvents);

		const result = await service.listOrders({ status: OrderStatus.PREPARING });

		expect(repository.findMany).toHaveBeenCalledWith({ status: OrderStatus.PREPARING });
		expect(result).toMatchObject({
			total: 1,
			orders: [
				{
					id: 'order-1',
					status: OrderStatus.PREPARING,
					subtotal: 20,
					deliveryFee: 5,
					discount: 0,
					total: 25,
				},
			],
		});
	});

	it('ignora status ALL na listagem admin', async () => {
		vi.mocked(repository.findMany).mockResolvedValue([]);
		const service = new AdminOrderService(repository, orderEvents);

		await service.listOrders({ status: 'ALL' });

		expect(repository.findMany).toHaveBeenCalledWith({
			excludedStatuses: [OrderStatus.CANCELLED, OrderStatus.DELIVERED],
			status: undefined,
		});
	});

	it('atualiza status e retorna null quando pedido nao existe', async () => {
		vi.mocked(repository.findById).mockResolvedValue(null);
		const service = new AdminOrderService(repository, orderEvents);

		const result = await service.updateOrderStatus('missing-order', {
			status: OrderStatus.CANCELLED,
		});

		expect(repository.findById).toHaveBeenCalledWith('missing-order');
		expect(repository.updateStatus).not.toHaveBeenCalled();
		expect(result).toBeNull();
		expect(orderEvents.emitOrderChanged).not.toHaveBeenCalled();
	});

	it('emite evento websocket depois de atualizar status do pedido', async () => {
		const order = createOrderRecord({ status: OrderStatus.CONFIRMED });
		vi.mocked(repository.findById).mockResolvedValue(createOrderRecord());
		vi.mocked(repository.updateStatus).mockResolvedValue(order);
		const service = new AdminOrderService(repository, orderEvents);

		const result = await service.updateOrderStatus('order-1', {
			status: OrderStatus.CONFIRMED,
		});

		expect(result).toMatchObject({
			id: 'order-1',
			status: OrderStatus.CONFIRMED,
		});
		expect(orderEvents.emitOrderChanged).toHaveBeenCalledWith({
			action: 'update',
			order: expect.objectContaining({
				id: 'order-1',
				status: OrderStatus.CONFIRMED,
			}),
			status: OrderStatus.CONFIRMED,
		});
	});

	it('bloqueia alteracao de pedido entregue ou cancelado', async () => {
		vi.mocked(repository.findById).mockResolvedValue(
			createOrderRecord({ status: OrderStatus.DELIVERED })
		);
		const service = new AdminOrderService(repository, orderEvents);

		await expect(
			service.updateOrderStatus('order-1', {
				status: OrderStatus.CONFIRMED,
			})
		).rejects.toBeInstanceOf(OrderStatusTransitionError);

		expect(repository.updateStatus).not.toHaveBeenCalled();
		expect(orderEvents.emitOrderChanged).not.toHaveBeenCalled();
	});

	it('permite entregar somente pedidos a caminho', async () => {
		vi.mocked(repository.findById).mockResolvedValue(
			createOrderRecord({ status: OrderStatus.PREPARING })
		);
		const service = new AdminOrderService(repository, orderEvents);

		await expect(
			service.updateOrderStatus('order-1', {
				status: OrderStatus.DELIVERED,
			})
		).rejects.toThrow('Apenas pedidos a caminho podem ser entregues');

		expect(repository.updateStatus).not.toHaveBeenCalled();
	});
});

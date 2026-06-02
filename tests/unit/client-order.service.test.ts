import { OrderStatus, PaymentType } from '@delivery-cruzeiro/types';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { OrderChangeEventPublisher } from '../../src/events/order-events.emitter.js';
import { ClientOrderService } from '../../src/services/client-order.service.js';
import type {
	AdminOrderRecord,
	ClientOrderRecord,
	ClientOrderRepository,
} from '../../src/repositories/order.repository.js';

const baseDate = new Date('2026-05-08T10:00:00.000Z');

function createClientOrderRecord(overrides: Partial<ClientOrderRecord> = {}): ClientOrderRecord {
	return {
		address: null,
		addressId: null,
		createdAt: baseDate,
		deliveredAt: null,
		deliveryFee: 0,
		discount: 0,
		estimatedDelivery: null,
		id: 'order-1',
		items: [
			{
				id: 'item-1',
				notes: null,
				orderId: 'order-1',
				price: 10,
				product: {
					description: 'Pizza grande',
					id: 'product-1',
					imageUrl: null,
					name: 'Pizza',
				},
				productId: 'product-1',
				quantity: 2,
			},
		],
		notes: null,
		paymentMethod: null,
		paymentMethodId: null,
		status: OrderStatus.PENDING,
		store: {
			id: 'store-1',
			isActive: true,
			name: 'loja 1',
			nickname: 'Pastel do cruzeiro - Loja 1',
		},
		storeId: 'store-1',
		subtotal: 20,
		total: 20,
		updatedAt: baseDate,
		userId: 'user-1',
		...overrides,
	} as unknown as ClientOrderRecord;
}

function createAdminOrderRecord(overrides: Partial<AdminOrderRecord> = {}): AdminOrderRecord {
	return {
		...createClientOrderRecord(),
		paymentMethod: null,
		user: {
			email: 'cliente@example.com',
			id: 'user-1',
			name: 'Cliente Teste',
			phone: null,
		},
		...overrides,
	} as unknown as AdminOrderRecord;
}

describe('ClientOrderService', () => {
	let orderEvents: OrderChangeEventPublisher;
	let repository: ClientOrderRepository;

	beforeEach(() => {
		orderEvents = {
			emitOrderChanged: vi.fn(),
		};
		repository = {
			createClientOrder: vi.fn(),
			findActivePaymentMethodForUser: vi.fn(),
			findActiveProductsByIds: vi.fn(),
			findActiveStoreById: vi.fn(),
			findAddressForUser: vi.fn(),
			findAdminOrderById: vi.fn(),
		};
	});

	it('cria pedido e emite evento websocket para atendentes', async () => {
		vi.mocked(repository.findActiveProductsByIds).mockResolvedValue([
			{
				id: 'product-1',
				price: 10,
			},
		]);
		vi.mocked(repository.findActiveStoreById).mockResolvedValue({
			addressId: 'store-address-1',
			id: 'store-1',
		});
		vi.mocked(repository.createClientOrder).mockResolvedValue(createClientOrderRecord());
		vi.mocked(repository.findAdminOrderById).mockResolvedValue(createAdminOrderRecord());
		const service = new ClientOrderService(repository, orderEvents);

		const result = await service.createOrder('user-1', {
			items: [
				{
					productId: 'product-1',
					quantity: 2,
				},
			],
			paymentType: PaymentType.CASH,
			storeId: 'store-1',
		});

		expect(result).toMatchObject({
			order: {
				id: 'order-1',
				status: OrderStatus.PENDING,
				total: 20,
			},
			success: true,
		});
		expect(repository.findActiveProductsByIds).toHaveBeenCalledWith(['product-1'], 'store-1');
		expect(repository.createClientOrder).toHaveBeenCalledWith(
			expect.objectContaining({
				addressId: 'store-address-1',
				status: OrderStatus.PENDING,
				storeId: 'store-1',
				subtotal: 20,
				total: 20,
			})
		);
		expect(orderEvents.emitOrderChanged).toHaveBeenCalledWith({
			action: 'create',
			order: expect.objectContaining({
				id: 'order-1',
				status: OrderStatus.PENDING,
			}),
			status: OrderStatus.PENDING,
		});
	});
});

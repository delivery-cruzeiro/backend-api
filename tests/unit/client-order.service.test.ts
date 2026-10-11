import { OrderStatus, PaymentType } from '@delivery-cruzeiro/types';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { OrderChangeEventPublisher } from '../../src/events/order-events.emitter.js';
import { ClientOrderService } from '../../src/services/client-order.service.js';
import type { StoreShippingService } from '../../src/services/store-shipping.service.js';
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
			findActiveStorePaymentMethod: vi.fn(),
			findActiveProductsByIds: vi.fn(),
			findActiveStoreById: vi.fn(),
			findAddressForUser: vi.fn(),
			findAdminOrderById: vi.fn(),
		};
	});

	it('aceita somente uma forma de pagamento ativa da loja e persiste a referencia', async () => {
		vi.mocked(repository.findActiveStoreById).mockResolvedValue({ addressId: 'store-address-1', id: 'store-1' });
		vi.mocked(repository.findActiveStorePaymentMethod).mockResolvedValue({ id: 'store-payment-1', type: PaymentType.PIX });
		vi.mocked(repository.findActiveProductsByIds).mockResolvedValue([{ id: 'product-1', price: 10 } as never]);
		vi.mocked(repository.createClientOrder).mockResolvedValue(createClientOrderRecord());
		vi.mocked(repository.findAdminOrderById).mockResolvedValue(null);
		const service = new ClientOrderService(repository, orderEvents);

		const result = await service.createOrder('user-1', {
			items: [{ productId: 'product-1', quantity: 1 }],
			paymentType: PaymentType.PIX,
			storeId: 'store-1',
			storePaymentMethodId: 'store-payment-1',
		});

		expect(result.success).toBe(true);
		expect(repository.createClientOrder).toHaveBeenCalledWith(expect.objectContaining({
			paymentType: PaymentType.PIX,
			storePaymentMethodId: 'store-payment-1',
		}));
	});

	it('rejeita forma de pagamento inativa ou pertencente a outra loja', async () => {
		vi.mocked(repository.findActiveStoreById).mockResolvedValue({ addressId: 'store-address-1', id: 'store-1' });
		vi.mocked(repository.findActiveStorePaymentMethod).mockResolvedValue(null);
		const service = new ClientOrderService(repository, orderEvents);
		const result = await service.createOrder('user-1', {
			items: [{ productId: 'product-1', quantity: 1 }],
			paymentType: PaymentType.CASH,
			storeId: 'store-1',
			storePaymentMethodId: 'unavailable-payment',
		});
		expect(result).toEqual({ error: 'Forma de pagamento indisponivel', statusCode: 404, success: false });
		expect(repository.createClientOrder).not.toHaveBeenCalled();
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

	it('recalcula o adicional pelo cadastro do produto', async () => {
		vi.mocked(repository.findActiveProductsByIds).mockResolvedValue([
			{
				additionalFields: [
					{
						additionalValue: 3.5,
						id: 'field-1',
						label: 'Borda recheada',
						options: [],
						type: 'CHECKBOX',
					},
				],
				id: 'product-1',
				price: 10,
			},
		]);
		vi.mocked(repository.findActiveStoreById).mockResolvedValue({
			addressId: 'store-address-1',
			id: 'store-1',
		});
		vi.mocked(repository.createClientOrder).mockResolvedValue(createClientOrderRecord());
		vi.mocked(repository.findAdminOrderById).mockResolvedValue(null);
		const service = new ClientOrderService(repository, orderEvents);

		await service.createOrder('user-1', {
			items: [
				{
					additionalFieldValues: [
						{
							additionalValue: 999,
							fieldId: 'field-1',
							label: 'Valor adulterado',
							type: 'CHECKBOX',
							value: true,
						},
					],
					productId: 'product-1',
					quantity: 2,
				},
			],
			paymentType: PaymentType.CASH,
			storeId: 'store-1',
		});

		expect(repository.createClientOrder).toHaveBeenCalledWith(
			expect.objectContaining({
				items: [expect.objectContaining({ price: 13.5 })],
				subtotal: 27,
				total: 27,
			})
		);
	});

	it('recalcula adicionais herdados de categoria e subcategoria', async () => {
		vi.mocked(repository.findActiveProductsByIds).mockResolvedValue([
			{
				additionalFields: [],
				category: {
					additionalFields: [
						{
							additionalValue: 2,
							id: 'category-extra',
							label: 'Embalagem especial',
							options: [],
							type: 'CHECKBOX',
						},
					],
					id: 'category-1',
				},
				id: 'product-1',
				price: 10,
				subcategory: {
					additionalFields: [
						{
							additionalValue: 1.5,
							id: 'subcategory-extra',
							label: 'Molho extra',
							options: [],
							type: 'CHECKBOX',
						},
					],
					id: 'subcategory-1',
				},
			},
		]);
		vi.mocked(repository.findActiveStoreById).mockResolvedValue({
			addressId: 'store-address-1',
			id: 'store-1',
		});
		vi.mocked(repository.createClientOrder).mockResolvedValue(createClientOrderRecord());
		vi.mocked(repository.findAdminOrderById).mockResolvedValue(null);
		const service = new ClientOrderService(repository, orderEvents);

		await service.createOrder('user-1', {
			items: [
				{
					additionalFieldValues: [
						{
							additionalValue: 999,
							fieldId: 'category:category-1:category-extra',
							label: 'Valor adulterado',
							type: 'CHECKBOX',
							value: true,
						},
						{
							additionalValue: 999,
							fieldId: 'subcategory:subcategory-1:subcategory-extra',
							label: 'Valor adulterado',
							type: 'CHECKBOX',
							value: true,
						},
					],
					productId: 'product-1',
					quantity: 2,
				},
			],
			paymentType: PaymentType.CASH,
			storeId: 'store-1',
		});

		expect(repository.createClientOrder).toHaveBeenCalledWith(
			expect.objectContaining({
				items: [expect.objectContaining({ price: 13.5 })],
				subtotal: 27,
				total: 27,
			})
		);
	});

	it('impede pedido para bairro bloqueado pela loja', async () => {
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
		vi.mocked(repository.findAddressForUser).mockResolvedValue({
			city: 'Campina Grande',
			id: 'address-1',
			neighborhood: 'Centro',
			state: 'PB',
			zipCodeValidated: true,
		});
		const storeShippingService = {
			resolveShippingQuote: vi.fn().mockResolvedValue({
				isAvailable: false,
				mode: 'DEFAULT',
				neighborhood: 'Centro',
				ruleId: 'rule-1',
				shippingTime: 0,
				source: 'blocked',
				value: 0,
			}),
		} as unknown as StoreShippingService;
		const service = new ClientOrderService(
			repository,
			orderEvents,
			undefined,
			storeShippingService
		);

		const result = await service.createOrder('user-1', {
			addressId: 'address-1',
			items: [{ productId: 'product-1', quantity: 1 }],
			paymentType: PaymentType.CASH,
			storeId: 'store-1',
		});

		expect(result).toEqual({
			error: 'Bairro fora do mapa de entrega da loja',
			statusCode: 400,
			success: false,
		});
		expect(repository.createClientOrder).not.toHaveBeenCalled();
	});

	it('impede pedido com endereco cujo CEP nao foi validado', async () => {
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
		vi.mocked(repository.findAddressForUser).mockResolvedValue({
			city: 'Campina Grande',
			id: 'address-1',
			neighborhood: 'Centro',
			state: 'PB',
			zipCodeValidated: false,
		});
		const storeShippingService = {
			resolveShippingQuote: vi.fn(),
		} as unknown as StoreShippingService;
		const service = new ClientOrderService(
			repository,
			orderEvents,
			undefined,
			storeShippingService
		);

		const result = await service.createOrder('user-1', {
			addressId: 'address-1',
			items: [{ productId: 'product-1', quantity: 1 }],
			paymentType: PaymentType.CASH,
			storeId: 'store-1',
		});

		expect(result).toEqual({
			error: 'Endereco com CEP nao validado',
			statusCode: 400,
			success: false,
		});
		expect(storeShippingService.resolveShippingQuote).not.toHaveBeenCalled();
		expect(repository.createClientOrder).not.toHaveBeenCalled();
	});
});

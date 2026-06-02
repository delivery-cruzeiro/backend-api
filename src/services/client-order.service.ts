import { OrderStatus, PaymentType, type ClientOrderDTO } from '@delivery-cruzeiro/types';
import {
	orderEventsEmitter,
	type OrderChangeEventPublisher,
} from '../events/order-events.emitter.js';
import {
	PrismaClientOrderRepository,
	type ClientOrderRepository,
} from '../repositories/order.repository.js';
import { serializeAdminOrder, serializeClientOrder } from './order-serialization.service.js';

type CreateClientOrderResult =
	| {
			order: ReturnType<typeof serializeClientOrder>;
			success: true;
	  }
	| {
			error: string;
			statusCode: 400 | 404;
			success: false;
	  };

export class ClientOrderService {
	constructor(
		private readonly orderRepository: ClientOrderRepository = new PrismaClientOrderRepository(),
		private readonly orderEvents: OrderChangeEventPublisher = orderEventsEmitter
	) {}

	async createOrder(userId: string, dto: ClientOrderDTO): Promise<CreateClientOrderResult> {
		const { addressId, items, notes, paymentMethodId, paymentType, storeId } = dto;
		const store = await this.orderRepository.findActiveStoreById(storeId);

		if (!store) {
			return {
				error: 'Loja nao encontrada',
				statusCode: 404,
				success: false,
			};
		}

		if (addressId) {
			const address = await this.orderRepository.findAddressForUser(addressId, userId);

			if (!address) {
				return {
					error: 'Endereco nao encontrado',
					statusCode: 404,
					success: false,
				};
			}
		}

		if (paymentMethodId) {
			const paymentMethod = await this.orderRepository.findActivePaymentMethodForUser(
				paymentMethodId,
				userId
			);

			if (!paymentMethod) {
				return {
					error: 'Metodo de pagamento nao encontrado',
					statusCode: 404,
					success: false,
				};
			}
		}

		if (
			(paymentType === PaymentType.CREDIT_CARD || paymentType === PaymentType.DEBIT_CARD) &&
			!paymentMethodId
		) {
			return {
				error: 'Metodo de pagamento obrigatorio',
				statusCode: 400,
				success: false,
			};
		}

		const uniqueProductIds = [...new Set(items.map(item => item.productId))];
		const products = await this.orderRepository.findActiveProductsByIds(
			uniqueProductIds,
			storeId
		);
		const productsById = new Map(products.map(product => [product.id, product]));

		if (products.length !== uniqueProductIds.length) {
			return {
				error: 'Produto indisponivel no carrinho',
				statusCode: 400,
				success: false,
			};
		}

		const orderItems = items.map(item => {
			const product = productsById.get(item.productId);
			const price = Number(product?.price ?? 0);

			return {
				notes: item.notes,
				price,
				productId: item.productId,
				quantity: item.quantity,
			};
		});
		const subtotal = orderItems.reduce(
			(total, item) => total + Number(item.price) * item.quantity,
			0
		);
		const deliveryFee = 0;
		const discount = 0;
		const total = subtotal + deliveryFee - discount;

		const order = await this.orderRepository.createClientOrder({
			addressId: addressId || store.addressId,
			deliveryFee,
			discount,
			items: orderItems,
			notes,
			paymentMethodId,
			status: OrderStatus.PENDING,
			storeId,
			subtotal,
			total,
			userId,
		});
		const adminOrder = await this.orderRepository.findAdminOrderById(order.id);

		if (adminOrder) {
			const serializedAdminOrder = serializeAdminOrder(adminOrder);

			this.orderEvents.emitOrderChanged({
				action: 'create',
				order: serializedAdminOrder,
				status: serializedAdminOrder.status,
			});
		}

		return {
			order: serializeClientOrder(order),
			success: true,
		};
	}
}

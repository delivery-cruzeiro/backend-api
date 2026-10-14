import { resolveAdditionalFields } from './configurable-fields.service.js';
import {
	OrderStatus,
	PaymentType,
	type ClientOrderDTO,
} from '@delivery-cruzeiro/types';
import {
	orderEventsEmitter,
	type OrderChangeEventPublisher,
} from '../events/order-events.emitter.js';
import {
	PrismaClientOrderRepository,
	type ClientOrderRepository,
} from '../repositories/order.repository.js';
import { serializeAdminOrder, serializeClientOrder } from './order-serialization.service.js';
import { PromotionCouponService } from './promotion-coupon.service.js';
import { StoreShippingService } from './store-shipping.service.js';
import { composeProductAdditionalFields } from './product-additional-fields.service.js';

type CreateClientOrderResult =
	| {
			order: ReturnType<typeof serializeClientOrder>;
			success: true;
	  }
	| {
			error: string;
			statusCode: 400 | 403 | 404 | 409;
			success: false;
	  };

export class ClientOrderService {
	constructor(
		private readonly orderRepository: ClientOrderRepository = new PrismaClientOrderRepository(),
		private readonly orderEvents: OrderChangeEventPublisher = orderEventsEmitter,
		private readonly promotionCouponService: PromotionCouponService = new PromotionCouponService(),
		private readonly storeShippingService: StoreShippingService = new StoreShippingService()
	) {}

	async prepareOrder(
		userId: string,
		dto: ClientOrderDTO
	): Promise<
		| Extract<CreateClientOrderResult, { success: false }>
		| { success: true; data: Parameters<ClientOrderRepository['createClientOrder']>[0] }
	> {
		const { addressId, items, notes, paymentMethodId, paymentType, promotionId, storeId, storePaymentMethodId } = dto;
		const store = await this.orderRepository.findActiveStoreById(storeId);

		if (!store) {
			return {
				error: 'Loja nao encontrada',
				statusCode: 404,
				success: false,
			};
		}

		const address = addressId
			? await this.orderRepository.findAddressForUser(addressId, userId)
			: null;

		if (addressId && !address) {
			return {
				error: 'Endereco nao encontrado',
				statusCode: 404,
				success: false,
			};
		}

		if (address && !address.zipCodeValidated) {
			return {
				error: 'Endereco com CEP nao validado',
				statusCode: 400,
				success: false,
			};
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

		let paymentFields = resolveAdditionalFields([], dto.paymentFieldValues);
		if (storePaymentMethodId) {
			const storePaymentMethod = await this.orderRepository.findActiveStorePaymentMethod(
				storePaymentMethodId,
				storeId
			);
			if (!storePaymentMethod) {
				return { error: 'Forma de pagamento indisponivel', statusCode: 404, success: false };
			}
			if (storePaymentMethod.type !== paymentType) {
				return { error: 'Forma de pagamento invalida', statusCode: 400, success: false };
			}
			paymentFields = resolveAdditionalFields(storePaymentMethod.fields, dto.paymentFieldValues);
		}
		if (!paymentFields.success) return { error: 'Campos do pagamento inválidos: ' + paymentFields.error, statusCode: 400, success: false };
		if (paymentType === PaymentType.CUSTOM && !storePaymentMethodId) return { error: 'Selecione uma forma de pagamento', statusCode: 400, success: false };

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

		const orderItems: Array<{
			notes?: string;
			price: number;
			productId: string;
			quantity: number;
		}> = [];

		for (const item of items) {
			const product = productsById.get(item.productId);
			const additionalFields = resolveAdditionalFields(
				product
					? composeProductAdditionalFields({
						category: product.category,
						product,
						subcategory: product.subcategory,
					})
					: [],
				item.additionalFieldValues
			);

			if (!additionalFields.success) {
				return {
					error: additionalFields.error,
					statusCode: 400,
					success: false,
				};
			}

			const price = Number(product?.price ?? 0) + additionalFields.additionalValue;
			const itemNotes = [item.notes?.trim(), additionalFields.notes]
				.filter(Boolean)
				.join('\n');

			orderItems.push({
				notes: itemNotes || undefined,
				price,
				productId: item.productId,
				quantity: item.quantity,
			});
		}
		const subtotal = orderItems.reduce(
			(total, item) => total + Number(item.price) * item.quantity,
			0
		);
		const shippingQuote = address
			? await this.storeShippingService.resolveShippingQuote({
                    addressId: address.id,
					neighborhood: address.neighborhood,
 city: address.city, state: address.state, latitude: address.latitude, longitude: address.longitude, locationConfirmed: address.locationConfirmed,
					storeId,
				})
			: null;

		if (shippingQuote && !shippingQuote.isAvailable) {
			return {
				error: shippingQuote.message ?? 'Bairro fora do mapa de entrega da loja',
				statusCode: 400,
				success: false,
			};
		}

		const deliveryFee = shippingQuote?.value ?? 0;
		let discount = 0;

		if (promotionId) {
			const couponResult = await this.promotionCouponService.validateCouponForUser({
				promotionId,
				storeId,
				subtotal,
				userId,
			});

			if (!couponResult.success) {
				return couponResult;
			}

			discount = couponResult.discount;
		}

		const total = Math.round((subtotal + deliveryFee + paymentFields.additionalValue - discount) * 100) / 100;

		return {
			success: true,
			data: {
				addressId: addressId || store.addressId,
 deliveryAreaId: shippingQuote?.areaId, deliveryAreaSnapshot: shippingQuote?.areaSnapshot,
				deliveryFee,
				deliveryMinutes: shippingQuote?.shippingTime,
				paymentAdditionalValue: paymentFields.additionalValue,
				paymentFieldValues: paymentFields.values,
				discount,
				items: orderItems,
				notes: [notes, paymentFields.notes && `Pagamento:\n${paymentFields.notes}`].filter(Boolean).join('\n') || undefined,
				paymentMethodId,
				paymentType,
				storePaymentMethodId,
				promotionId,
				status: OrderStatus.PENDING,
				storeId,
				subtotal,
				total,
				userId,
			},
		};
	}

	async createOrder(userId: string, dto: ClientOrderDTO): Promise<CreateClientOrderResult> {
		const prepared = await this.prepareOrder(userId, dto);
		if (!prepared.success) return prepared;
		const order = await this.orderRepository.createClientOrder(prepared.data);
		await this.promotionCouponService.consumeCouponUsage(dto.promotionId);
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



import {
	OrderStatus,
	PaymentType,
	ProductAdditionalFieldType,
	productAdditionalFieldSchema,
	type ClientOrderDTO,
	type ProductAdditionalFieldDTO,
	type ProductAdditionalFieldValueDTO,
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

function formatAdditionalValue(value: number) {
	return value.toLocaleString('pt-BR', { currency: 'BRL', style: 'currency' });
}

function resolveAdditionalFields(
	configuredFieldsValue: unknown,
	selectedValues: ProductAdditionalFieldValueDTO[] = []
): { error: string; success: false } | { additionalValue: number; notes: string; success: true } {
	const configuredFieldsInput = configuredFieldsValue ?? [];
	if (!Array.isArray(configuredFieldsInput)) {
		return {
			error: 'Configuracao de campos adicionais do produto invalida',
			success: false,
		};
	}

	const configuredFieldsList: ProductAdditionalFieldDTO[] = [];
	for (const configuredFieldValue of configuredFieldsInput) {
		const configuredField = productAdditionalFieldSchema.safeParse(configuredFieldValue);
		if (!configuredField.success) {
			return {
				error: 'Configuracao de campos adicionais do produto invalida',
				success: false,
			};
		}
		configuredFieldsList.push(configuredField.data);
	}

	const configuredFields = new Map(configuredFieldsList.map(field => [field.id, field]));
	const selectedIds = new Set<string>();
	const normalizedValues: ProductAdditionalFieldValueDTO[] = [];

	for (const selectedValue of selectedValues) {
		if (selectedIds.has(selectedValue.fieldId)) {
			return { error: 'Campo adicional duplicado no produto', success: false };
		}

		selectedIds.add(selectedValue.fieldId);
		const configuredField = configuredFields.get(selectedValue.fieldId);

		if (!configuredField || configuredField.type !== selectedValue.type) {
			return { error: 'Campo adicional do produto nao encontrado', success: false };
		}

		const value = selectedValue.value;
		const isValidValue =
			configuredField.type === ProductAdditionalFieldType.CHECKBOX
				? value === true
				: typeof value === 'string' &&
					value.trim().length > 0 &&
					(configuredField.type === ProductAdditionalFieldType.TEXT ||
						configuredField.options.includes(value));

		if (!isValidValue) {
			return { error: 'Valor de campo adicional do produto invalido', success: false };
		}

		normalizedValues.push({
			additionalValue: configuredField.additionalValue,
			fieldId: configuredField.id,
			label: configuredField.label,
			type: configuredField.type,
			value,
		});
	}

	const additionalValue = normalizedValues.reduce(
		(total, field) => total + Number(field.additionalValue ?? 0),
		0
	);
	const notes = normalizedValues
		.map(field => {
			const displayedValue =
				field.type === ProductAdditionalFieldType.CHECKBOX
					? field.label
					: `${field.label}: ${field.value}`;
			const price = Number(field.additionalValue ?? 0);
			return price > 0
				? `${displayedValue} (+${formatAdditionalValue(price)})`
				: displayedValue;
		})
		.join('\n');

	return { additionalValue, notes, success: true };
}

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
		const { addressId, items, notes, paymentMethodId, paymentType, promotionId, storeId } = dto;
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
				product?.additionalFields,
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
					neighborhood: address.neighborhood,
					storeId,
				})
			: null;

		if (shippingQuote && !shippingQuote.isAvailable) {
			return {
				error: 'Bairro fora do mapa de entrega da loja',
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

		const total = subtotal + deliveryFee - discount;

		return {
			success: true,
			data: {
				addressId: addressId || store.addressId,
				deliveryFee,
				discount,
				items: orderItems,
				notes,
				paymentMethodId,
				paymentType,
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

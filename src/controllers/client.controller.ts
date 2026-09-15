import {
	PaymentCardType,
	whatsAppPhoneSchema,
	applyPromotionCouponSchema,
	createClientAddressSchema,
	createClientOrderSchema,
	createClientPaymentMethodSchema,
	formatZodError,
	listClientOrdersQuerySchema,
	updateClientAddressSchema,
	updateClientProfileSchema,
	type ApplyPromotionCouponDTO,
	type ClientAddressDTO,
	type ClientOrderDTO,
	type ClientPaymentMethodDTO,
	type ListClientOrdersQueryDTO,
	type UpdateClientAddressDTO,
	type UpdateClientProfileDTO,
} from '@delivery-cruzeiro/types';
import type { FastifyReply, FastifyRequest } from 'fastify';
import type { AuthenticatedRequest } from '../middleware/auth.middleware.js';
import { prisma } from '../lib/prisma.js';
import { ClientOrderService } from '../services/client-order.service.js';
import { CheckoutPixService } from '../services/checkout-pix.service.js';
const checkoutPixService = new CheckoutPixService();

export const sendClientCheckoutPix = async (request: AuthenticatedRequest, reply: FastifyReply) => {
	const validation = createClientOrderSchema.safeParse(request.body);
	if (!validation.success) return reply.status(400).send({ error: 'Dados do pedido inválidos.' });
	const result = await checkoutPixService.send(request.user!.id, validation.data);
	if ('error' in result) return reply.status(result.statusCode ?? 400).send(result);
	return reply.send(result);
};

export const updateClientPhone = async (request: AuthenticatedRequest, reply: FastifyReply) => {
	const validation = whatsAppPhoneSchema.safeParse((request.body as { phone?: unknown })?.phone);
	if (!validation.success)
		return reply.status(400).send({ error: 'Informe um telefone válido com DDD.' });
	const user = await prisma.user.update({
		where: { id: request.user!.id },
		data: { phone: validation.data },
		select: publicUserSelect,
	});
	return reply.send({ user });
};
import { PromotionCouponService } from '../services/promotion-coupon.service.js';
import { StoreShippingService } from '../services/store-shipping.service.js';
import {
	normalizeZipCode,
	ViaCepService,
	ViaCepUnavailableError,
	type AddressForZipCodeValidation,
} from '../services/via-cep.service.js';

const clientOrderService = new ClientOrderService();
const promotionCouponService = new PromotionCouponService();
const storeShippingService = new StoreShippingService();
const viaCepService = new ViaCepService();

const publicUserSelect = {
	id: true,
	email: true,
	name: true,
	gender: true,
	phone: true,
	avatar: true,
	role: true,
	isActive: true,
	emailVerified: true,
	createdAt: true,
	updatedAt: true,
} as const;

const addressSelect = {
	id: true,
	userId: true,
	street: true,
	number: true,
	complement: true,
	neighborhood: true,
	city: true,
	state: true,
	zipCode: true,
	zipCodeValidated: true,
	latitude: true,
	longitude: true,
	isDefault: true,
	createdAt: true,
	updatedAt: true,
} as const;

type AddressLookupQuery = {
	city?: string;
	state?: string;
	street?: string;
	zipCode?: string;
};

async function getZipCodeValidationError(address: AddressForZipCodeValidation) {
	try {
		const isValid = await viaCepService.validateAddress(address);

		return isValid
			? null
			: {
					code: 'INVALID_ZIP_CODE',
					error: 'O CEP nao corresponde ao endereco informado',
					status: 400,
				};
	} catch (error) {
		if (error instanceof ViaCepUnavailableError) {
			return { code: 'ZIP_CODE_SERVICE_UNAVAILABLE', error: error.message, status: 502 };
		}

		throw error;
	}
}

const paymentMethodSelect = {
	id: true,
	userId: true,
	type: true,
	cardType: true,
	provider: true,
	providerId: true,
	last4: true,
	expiryMonth: true,
	expiryYear: true,
	cardHolder: true,
	isDefault: true,
	isActive: true,
	createdAt: true,
	updatedAt: true,
} as const;

const storeSummarySelect = {
	id: true,
	name: true,
	nickname: true,
	isActive: true,
} as const;

const orderSelect = {
	orderNumber: true,
	id: true,
	userId: true,
	addressId: true,
	address: {
		select: addressSelect,
	},
	storeId: true,
	store: {
		select: storeSummarySelect,
	},
	paymentType: true,
	paymentMethodId: true,
	promotionId: true,
	paymentMethod: {
		select: paymentMethodSelect,
	},
	status: true,
	subtotal: true,
	deliveryFee: true,
	discount: true,
	total: true,
	notes: true,
	estimatedDelivery: true,
	deliveredAt: true,
	createdAt: true,
	updatedAt: true,
	items: {
		select: {
			id: true,
			orderId: true,
			productId: true,
			product: {
				select: {
					id: true,
					name: true,
					description: true,
					imageUrl: true,
				},
			},
			quantity: true,
			price: true,
			notes: true,
		},
	},
} as const;

function getUserId(request: AuthenticatedRequest) {
	return request.user?.id as string;
}

function serializePaymentMethod(paymentMethod: Record<string, unknown>) {
	return paymentMethod;
}

function serializeOrder(order: {
	subtotal: unknown;
	deliveryFee: unknown;
	discount: unknown;
	total: unknown;
	items: Array<{ price: unknown; [key: string]: unknown }>;
	[key: string]: unknown;
}) {
	return {
		...order,
		deliveryFee: Number(order.deliveryFee),
		discount: Number(order.discount),
		items: order.items.map(item => ({
			...item,
			price: Number(item.price),
		})),
		subtotal: Number(order.subtotal),
		total: Number(order.total),
	};
}

function paymentTypeFromCardType(cardType: PaymentCardType) {
	return cardType === PaymentCardType.CREDIT ? 'CREDIT_CARD' : 'DEBIT_CARD';
}

export const getClientProfile = async (request: AuthenticatedRequest, reply: FastifyReply) => {
	const user = await prisma.user.findUnique({
		where: { id: getUserId(request) },
		select: publicUserSelect,
	});

	return reply.send({ user });
};

export const updateClientProfile = async (
	request: FastifyRequest<{ Body: UpdateClientProfileDTO }> & AuthenticatedRequest,
	reply: FastifyReply
) => {
	const validation = updateClientProfileSchema.safeParse(request.body ?? {});

	if (!validation.success) {
		const error = formatZodError(validation.error);

		return reply.status(error.statusCode ?? 400).send({
			error: error.message,
			code: error.code,
			details: error.details,
		});
	}

	const user = await prisma.user.update({
		where: { id: getUserId(request) },
		data: validation.data,
		select: publicUserSelect,
	});

	return reply.send({
		message: 'Perfil atualizado com sucesso',
		user,
	});
};

export const deactivateClientAccount = async (
	request: AuthenticatedRequest,
	reply: FastifyReply
) => {
	await prisma.user.update({
		where: { id: getUserId(request) },
		data: { isActive: false },
	});

	return reply.send({
		message: 'Conta desativada com sucesso',
	});
};

export const getClientAddresses = async (request: AuthenticatedRequest, reply: FastifyReply) => {
	const addresses = await prisma.address.findMany({
		where: { userId: getUserId(request) },
		orderBy: [{ isDefault: 'desc' }, { createdAt: 'desc' }],
		select: addressSelect,
	});

	return reply.send({
		addresses,
		total: addresses.length,
	});
};

export const getClientAddressByZipCode = async (
	request: FastifyRequest<{ Querystring: AddressLookupQuery }> & AuthenticatedRequest,
	reply: FastifyReply
) => {
	const zipCode = normalizeZipCode(request.query.zipCode ?? '');

	if (zipCode.length !== 8) {
		return reply.status(400).send({ error: 'Informe um CEP com 8 digitos' });
	}

	try {
		const address = await viaCepService.lookupByZipCode(zipCode);

		if (!address) {
			return reply.status(404).send({ error: 'CEP nao encontrado' });
		}

		return reply.send({ address });
	} catch (error) {
		if (error instanceof ViaCepUnavailableError) {
			return reply.status(502).send({ error: error.message });
		}

		throw error;
	}
};

export const searchClientAddressesByLocation = async (
	request: FastifyRequest<{ Querystring: AddressLookupQuery }> & AuthenticatedRequest,
	reply: FastifyReply
) => {
	const state = request.query.state?.trim().toUpperCase() ?? '';
	const city = request.query.city?.trim() ?? '';
	const street = request.query.street?.trim() ?? '';

	if (state.length !== 2 || city.length < 3 || street.length < 3) {
		return reply.status(400).send({
			error: 'Informe UF, cidade e logradouro para buscar o CEP',
		});
	}

	try {
		const addresses = await viaCepService.searchByAddress({ city, state, street });

		return reply.send({ addresses, total: addresses.length });
	} catch (error) {
		if (error instanceof ViaCepUnavailableError) {
			return reply.status(502).send({ error: error.message });
		}

		throw error;
	}
};

export const createClientAddress = async (
	request: FastifyRequest<{ Body: ClientAddressDTO }> & AuthenticatedRequest,
	reply: FastifyReply
) => {
	const validation = createClientAddressSchema.safeParse(request.body ?? {});

	if (!validation.success) {
		const error = formatZodError(validation.error);

		return reply.status(error.statusCode ?? 400).send({
			error: error.message,
			code: error.code,
			details: error.details,
		});
	}

	const zipCodeValidationError = await getZipCodeValidationError(validation.data);

	if (zipCodeValidationError) {
		return reply.status(zipCodeValidationError.status).send({
			code: zipCodeValidationError.code,
			error: zipCodeValidationError.error,
		});
	}

	const address = await prisma.address.create({
		data: {
			...validation.data,
			userId: getUserId(request),
			zipCodeValidated: true,
		},
		select: addressSelect,
	});

	return reply.status(201).send({
		address,
		message: 'Endereco criado com sucesso',
	});
};

export const updateClientAddress = async (
	request: FastifyRequest<{ Body: UpdateClientAddressDTO; Params: { id: string } }> &
		AuthenticatedRequest,
	reply: FastifyReply
) => {
	const validation = updateClientAddressSchema.safeParse(request.body ?? {});

	if (!validation.success) {
		const error = formatZodError(validation.error);

		return reply.status(error.statusCode ?? 400).send({
			error: error.message,
			code: error.code,
			details: error.details,
		});
	}

	const existingAddress = await prisma.address.findFirst({
		where: {
			id: request.params.id,
			userId: getUserId(request),
		},
		select: {
			city: true,
			id: true,
			neighborhood: true,
			state: true,
			street: true,
			zipCode: true,
		},
	});

	if (!existingAddress) {
		return reply.status(404).send({ error: 'Endereco nao encontrado' });
	}

	const zipCodeValidationError = await getZipCodeValidationError({
		city: validation.data.city ?? existingAddress.city,
		neighborhood: validation.data.neighborhood ?? existingAddress.neighborhood,
		state: validation.data.state ?? existingAddress.state,
		street: validation.data.street ?? existingAddress.street,
		zipCode: validation.data.zipCode ?? existingAddress.zipCode,
	});

	if (zipCodeValidationError) {
		return reply.status(zipCodeValidationError.status).send({
			code: zipCodeValidationError.code,
			error: zipCodeValidationError.error,
		});
	}

	const address = await prisma.address.update({
		where: { id: request.params.id },
		data: { ...validation.data, zipCodeValidated: true },
		select: addressSelect,
	});

	return reply.send({
		address,
		message: 'Endereco atualizado com sucesso',
	});
};

export const deleteClientAddress = async (
	request: FastifyRequest<{ Params: { id: string } }> & AuthenticatedRequest,
	reply: FastifyReply
) => {
	const existingAddress = await prisma.address.findFirst({
		where: {
			id: request.params.id,
			userId: getUserId(request),
		},
		select: { id: true },
	});

	if (!existingAddress) {
		return reply.status(404).send({ error: 'Endereco nao encontrado' });
	}

	await prisma.address.delete({
		where: { id: request.params.id },
	});

	return reply.send({ message: 'Endereco removido com sucesso' });
};

export const getClientPaymentMethods = async (
	request: AuthenticatedRequest,
	reply: FastifyReply
) => {
	const paymentMethods = await prisma.paymentMethod.findMany({
		where: { userId: getUserId(request) },
		orderBy: [{ isDefault: 'desc' }, { createdAt: 'desc' }],
		select: paymentMethodSelect,
	});

	return reply.send({
		paymentMethods: paymentMethods.map(paymentMethod => serializePaymentMethod(paymentMethod)),
		total: paymentMethods.length,
	});
};

export const createClientPaymentMethod = async (
	request: FastifyRequest<{ Body: ClientPaymentMethodDTO }> & AuthenticatedRequest,
	reply: FastifyReply
) => {
	const validation = createClientPaymentMethodSchema.safeParse(request.body ?? {});

	if (!validation.success) {
		const error = formatZodError(validation.error);

		return reply.status(error.statusCode ?? 400).send({
			error: error.message,
			code: error.code,
			details: error.details,
		});
	}

	const paymentMethod = await prisma.paymentMethod.create({
		data: {
			...validation.data,
			type: paymentTypeFromCardType(validation.data.cardType),
			userId: getUserId(request),
		},
		select: paymentMethodSelect,
	});

	return reply.status(201).send({
		message: 'Metodo de pagamento criado com sucesso',
		paymentMethod: serializePaymentMethod(paymentMethod),
	});
};

export const createClientOrder = async (
	request: FastifyRequest<{ Body: ClientOrderDTO }> & AuthenticatedRequest,
	reply: FastifyReply
) => {
	const validation = createClientOrderSchema.safeParse(request.body ?? {});

	if (!validation.success) {
		const error = formatZodError(validation.error);

		return reply.status(error.statusCode ?? 400).send({
			error: error.message,
			code: error.code,
			details: error.details,
		});
	}

	const userId = getUserId(request);
	const result = await clientOrderService.createOrder(userId, validation.data);

	if (!result.success) {
		return reply.status(result.statusCode).send({ error: result.error });
	}

	return reply.status(201).send({
		message: 'Pedido criado com sucesso',
		order: result.order,
	});
};

export const getClientShippingQuote = async (
	request: FastifyRequest<{ Querystring: { addressId?: string; storeId?: string } }> &
		AuthenticatedRequest,
	reply: FastifyReply
) => {
	const storeId = request.query.storeId?.trim();

	if (!storeId) {
		return reply.status(400).send({ error: 'storeId e obrigatorio' });
	}

	if (!request.query.addressId) {
		return reply.send({
			isAvailable: true,
			mode: 'PICKUP',
			neighborhood: null,
			shippingTime: 0,
			source: 'pickup',
			value: 0,
		});
	}

	const address = await prisma.address.findFirst({
		where: {
			id: request.query.addressId,
			userId: getUserId(request),
		},
		select: {
			neighborhood: true,
			zipCodeValidated: true,
		},
	});

	if (!address) {
		return reply.status(404).send({ error: 'Endereco nao encontrado' });
	}

	if (!address.zipCodeValidated) {
		return reply.status(400).send({ error: 'Endereco com CEP nao validado' });
	}

	const quote = await storeShippingService.resolveShippingQuote({
		neighborhood: address.neighborhood,
		storeId,
	});

	return reply.send(quote);
};

export const applyClientPromotionCoupon = async (
	request: FastifyRequest<{ Body: ApplyPromotionCouponDTO }> & AuthenticatedRequest,
	reply: FastifyReply
) => {
	const validation = applyPromotionCouponSchema.safeParse(request.body ?? {});

	if (!validation.success) {
		const error = formatZodError(validation.error);

		return reply.status(error.statusCode ?? 400).send({
			error: error.message,
			code: error.code,
			details: error.details,
		});
	}

	const result = await promotionCouponService.validateCouponForUser({
		code: validation.data.code,
		storeId: validation.data.storeId,
		subtotal: validation.data.subtotal,
		userId: getUserId(request),
	});

	if (!result.success) {
		return reply.status(result.statusCode).send({ error: result.error });
	}

	return reply.send(result);
};

export const getClientOrders = async (
	request: FastifyRequest<{ Querystring: ListClientOrdersQueryDTO }> & AuthenticatedRequest,
	reply: FastifyReply
) => {
	const validation = listClientOrdersQuerySchema.safeParse(request.query ?? {});

	if (!validation.success) {
		const error = formatZodError(validation.error);

		return reply.status(error.statusCode ?? 400).send({
			error: error.message,
			code: error.code,
			details: error.details,
		});
	}

	const { status, storeId } = validation.data;
	const orders = await prisma.order.findMany({
		where: {
			userId: getUserId(request),
			...(status && status !== 'ALL' ? { status } : {}),
			...(storeId && storeId !== 'ALL' ? { storeId } : {}),
		},
		orderBy: { createdAt: 'desc' },
		select: orderSelect,
	});

	return reply.send({
		orders: orders.map(order => serializeOrder(order)),
		total: orders.length,
	});
};

export const getClientOrderById = async (
	request: FastifyRequest<{ Params: { id: string } }> & AuthenticatedRequest,
	reply: FastifyReply
) => {
	const order = await prisma.order.findFirst({
		where: {
			id: request.params.id,
			userId: getUserId(request),
		},
		select: orderSelect,
	});

	if (!order) {
		return reply.status(404).send({ error: 'Pedido nao encontrado' });
	}

	return reply.send({
		order: serializeOrder(order),
	});
};

import {
	PaymentCardType,
	createClientAddressSchema,
	createClientOrderSchema,
	createClientPaymentMethodSchema,
	formatZodError,
	listClientOrdersQuerySchema,
	updateClientAddressSchema,
	updateClientProfileSchema,
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

const clientOrderService = new ClientOrderService();

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
	latitude: true,
	longitude: true,
	isDefault: true,
	createdAt: true,
	updatedAt: true,
} as const;

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
	paymentMethodId: true,
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

	const address = await prisma.address.create({
		data: {
			...validation.data,
			userId: getUserId(request),
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
		select: { id: true },
	});

	if (!existingAddress) {
		return reply.status(404).send({ error: 'Endereco nao encontrado' });
	}

	const address = await prisma.address.update({
		where: { id: request.params.id },
		data: validation.data,
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

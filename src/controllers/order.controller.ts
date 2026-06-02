import {
	formatZodError,
	listAdminOrdersQuerySchema,
	updateAdminOrderStatusSchema,
	type ListAdminOrdersQueryDTO,
	type UpdateAdminOrderStatusDTO,
} from '@delivery-cruzeiro/types';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { AdminOrderService, OrderStatusTransitionError } from '../services/admin-order.service.js';

const adminOrderService = new AdminOrderService();

function sendValidationError(reply: FastifyReply, error: ReturnType<typeof formatZodError>) {
	return reply.status(error.statusCode ?? 400).send({
		error: error.message,
		code: error.code,
		details: error.details,
	});
}

export const getAdminOrders = async (
	request: FastifyRequest<{ Querystring: ListAdminOrdersQueryDTO }>,
	reply: FastifyReply
) => {
	const validation = listAdminOrdersQuerySchema.safeParse(request.query ?? {});

	if (!validation.success) {
		return sendValidationError(reply, formatZodError(validation.error));
	}

	const result = await adminOrderService.listOrders(validation.data);

	return reply.send(result);
};

export const updateAdminOrderStatus = async (
	request: FastifyRequest<{ Body: UpdateAdminOrderStatusDTO; Params: { id: string } }>,
	reply: FastifyReply
) => {
	const validation = updateAdminOrderStatusSchema.safeParse(request.body ?? {});

	if (!validation.success) {
		return sendValidationError(reply, formatZodError(validation.error));
	}

	let order: Awaited<ReturnType<typeof adminOrderService.updateOrderStatus>>;

	try {
		order = await adminOrderService.updateOrderStatus(request.params.id, validation.data);
	} catch (error) {
		if (error instanceof OrderStatusTransitionError) {
			return reply.status(error.statusCode).send({ error: error.message });
		}

		throw error;
	}

	if (!order) {
		return reply.status(404).send({ error: 'Pedido nao encontrado' });
	}

	return reply.send({
		message: 'Status do pedido atualizado com sucesso',
		order,
	});
};

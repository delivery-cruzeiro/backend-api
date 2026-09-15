import {
	formatZodError,
	updateDefaultShippingSchema,
	upsertNeighborhoodShippingSchema,
	type UpdateDefaultShippingDTO,
	type UpsertNeighborhoodShippingDTO,
} from '@delivery-cruzeiro/types';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { StoreShippingService } from '../services/store-shipping.service.js';

const storeShippingService = new StoreShippingService();

type ShippingSummaryQuery = {
	city?: string;
	state?: string;
	storeId?: string;
};

function sendValidationError(reply: FastifyReply, error: ReturnType<typeof formatZodError>) {
	return reply.status(error.statusCode ?? 400).send({
		code: error.code,
		details: error.details,
		error: error.message,
	});
}

export const getStoreShippingSummary = async (
	request: FastifyRequest<{ Querystring: ShippingSummaryQuery }>,
	reply: FastifyReply
) => {
	const storeId = request.query.storeId?.trim();

	if (!storeId) {
		return reply.status(400).send({ error: 'storeId e obrigatorio' });
	}

	const summary = await storeShippingService.getSummary({
		city: request.query.city,
		state: request.query.state,
		storeId,
	});

	if (!summary) {
		return reply.status(404).send({ error: 'Loja nao encontrada' });
	}

	return reply.send(summary);
};

export const upsertStoreNeighborhoodShipping = async (
	request: FastifyRequest<{ Body: UpsertNeighborhoodShippingDTO }>,
	reply: FastifyReply
) => {
	const validation = upsertNeighborhoodShippingSchema.safeParse(request.body ?? {});

	if (!validation.success) {
		return sendValidationError(reply, formatZodError(validation.error));
	}

	try {
		const result = await storeShippingService.upsertNeighborhoodShipping(validation.data);

		if (!result) {
			return reply.status(404).send({ error: 'Loja nao encontrada' });
		}

		return reply.send({
			message: 'Configuracao de frete do bairro salva com sucesso',
			...result,
		});
	} catch (error) {
		if (error instanceof Error) {
			return reply.status(400).send({ error: error.message });
		}

		throw error;
	}
};

export const updateStoreDefaultShipping = async (
	request: FastifyRequest<{ Body: UpdateDefaultShippingDTO }>,
	reply: FastifyReply
) => {
	const validation = updateDefaultShippingSchema.safeParse(request.body ?? {});

	if (!validation.success) {
		return sendValidationError(reply, formatZodError(validation.error));
	}

	const defaultShipping = await storeShippingService.updateDefaultShipping(validation.data);

	if (!defaultShipping) {
		return reply.status(404).send({ error: 'Loja nao encontrada' });
	}

	return reply.send({
		defaultShipping,
		message: 'Configuracao de entrega padrao salva com sucesso',
	});
};

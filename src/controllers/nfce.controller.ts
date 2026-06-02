import type { FastifyReply, FastifyRequest } from 'fastify';
import { EmitNfceService } from '../services/fiscal/nfce/emit-nfce.service.js';

const emitNfceService = new EmitNfceService();

export const emitNfce = async (
	request: FastifyRequest<{ Params: { orderId: string } }>,
	reply: FastifyReply
) => {
	const result = await emitNfceService.execute(request.params.orderId);

	if (!result.success) {
		return reply.status(result.statusCode).send({ error: result.error });
	}

	const statusCode = result.status === 'AUTHORIZED' ? 201 : 202;

	return reply.status(statusCode).send(result);
};

export const emitNfceTest = async (
	request: FastifyRequest<{ Params: { orderId: string } }>,
	reply: FastifyReply
) => {
	const result = await emitNfceService.executeTest(request.params.orderId);

	if (!result.success) {
		return reply.status(result.statusCode).send({ error: result.error });
	}

	const statusCode = result.status === 'AUTHORIZED' ? 201 : 202;

	return reply.status(statusCode).send(result);
};

import type { FastifyReply, FastifyRequest } from 'fastify';
import { EmitNfeService } from '../services/fiscal/nfe/emit-nfe.service.js';

const emitNfeService = new EmitNfeService();

export const emitNfe = async (
	request: FastifyRequest<{ Params: { orderId: string } }>,
	reply: FastifyReply
) => {
	const result = await emitNfeService.execute(request.params.orderId);

	if (!result.success) {
		return reply.status(result.statusCode).send({ error: result.error });
	}

	const statusCode = result.status === 'AUTHORIZED' ? 201 : 202;

	return reply.status(statusCode).send(result);
};

export const emitNfeTest = async (
	request: FastifyRequest<{ Params: { orderId: string } }>,
	reply: FastifyReply
) => {
	const result = await emitNfeService.executeTest(request.params.orderId);

	if (!result.success) {
		return reply.status(result.statusCode).send({ error: result.error });
	}

	const statusCode = result.status === 'AUTHORIZED' ? 201 : 202;

	return reply.status(statusCode).send(result);
};

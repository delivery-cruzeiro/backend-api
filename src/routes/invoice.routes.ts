import type { FastifyInstance, FastifyReply } from 'fastify';
import { requireManager } from '../middleware/auth.middleware.js';
import {
	FiscalEmissionService,
	FiscalRequestError,
} from '../services/fiscal/shared/fiscal-emission.service.js';
import type { FiscalEnvironment } from '../services/fiscal/shared/types/fiscal-emission.types.js';

const service = new FiscalEmissionService();
const identifier = { type: 'string', minLength: 1, maxLength: 100 } as const;
const orderSchema = {
	params: { type: 'object', properties: { orderId: identifier }, required: ['orderId'] },
} as const;
const documentSchema = {
	params: {
		type: 'object',
		properties: { orderId: identifier, documentId: identifier },
		required: ['orderId', 'documentId'],
	},
} as const;

export async function invoiceRoutes(fastify: FastifyInstance) {
	const options = { preHandler: requireManager, schema: orderSchema };
	fastify.get<{ Params: { orderId: string } }>(
		'/invoice/orders/:orderId/documents',
		options,
		(request, reply) =>
			handle(reply, async () =>
				reply
					.header('Cache-Control', 'no-store')
					.send(await service.list(request.params.orderId))
			)
	);
	for (const [name, model] of [
		['nfe', '55'],
		['nfce', '65'],
	] as const) {
		for (const [mode, environment] of [
			['emit', '1'],
			['test', '2'],
		] as const) {
			fastify.post<{ Params: { orderId: string } }>(
				`/invoice/${name}/${mode}/:orderId`,
				options,
				(request, reply) =>
					handle(reply, async () => {
						const document = await service.enqueue(
							request.params.orderId,
							environment,
							model
						);
						return reply.code(pending(document.status) ? 202 : 200).send(document);
					})
			);
		}
	}
	for (const [mode, environment] of [
		['emit', '1'],
		['test', '2'],
	] as const satisfies readonly (readonly [string, FiscalEnvironment])[]) {
		fastify.post<{ Params: { orderId: string } }>(
			`/invoice/orders/:orderId/${mode}`,
			options,
			(request, reply) =>
				handle(reply, async () => {
					const document = await service.enqueue(request.params.orderId, environment);
					return reply.code(pending(document.status) ? 202 : 200).send(document);
				})
		);
	}
	for (const format of [undefined, 'xml', 'danfe'] as const) {
		const suffix = format ? '/' + format : '';
		fastify.get<{ Params: { orderId: string; documentId: string } }>(
			`/invoice/orders/:orderId/documents/:documentId${suffix}`,
			{ preHandler: requireManager, schema: documentSchema },
			(request, reply) =>
				handle(reply, async () => {
					const result = await service.get(
						request.params.orderId,
						request.params.documentId,
						format
					);
					reply.header('Cache-Control', 'no-store');
					if (format === 'xml')
						reply
							.type('application/xml; charset=utf-8')
							.header(
								'Content-Disposition',
								'attachment; filename="documento-fiscal.xml"'
							);
					return reply.send(result);
				})
		);
	}
	fastify.post<{ Params: { orderId: string; documentId: string } }>(
		'/invoice/orders/:orderId/documents/:documentId/reconcile',
		{ preHandler: requireManager, schema: documentSchema },
		(request, reply) =>
			handle(reply, async () =>
				reply
					.code(202)
					.send(
						await service.reconcile(request.params.orderId, request.params.documentId)
					)
			)
	);
}

function pending(status: string) {
	return ['PENDING', 'PROCESSING', 'AWAITING_SEFAZ'].includes(status);
}

async function handle(reply: FastifyReply, action: () => Promise<FastifyReply>) {
	try {
		return await action();
	} catch (error) {
		if (error instanceof FiscalRequestError)
			return reply.code(error.statusCode).send({ error: error.message });
		throw error;
	}
}

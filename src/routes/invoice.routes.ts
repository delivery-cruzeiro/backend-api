import type { FastifyInstance, RouteHandlerMethod } from 'fastify';
import { emitNfce, emitNfceTest } from '../controllers/nfce.controller.js';
import { emitNfe, emitNfeTest } from '../controllers/nfe.controller.js';
import { requireManager } from '../middleware/auth.middleware.js';

const emitNfeHandler = emitNfe as unknown as RouteHandlerMethod;
const emitNfeTestHandler = emitNfeTest as unknown as RouteHandlerMethod;
const emitNfceHandler = emitNfce as unknown as RouteHandlerMethod;
const emitNfceTestHandler = emitNfceTest as unknown as RouteHandlerMethod;

const orderIdParamsSchema = {
	properties: {
		orderId: { type: 'string' },
	},
	required: ['orderId'],
	type: 'object',
} as const;

export async function invoiceRoutes(fastify: FastifyInstance) {
	fastify.post(
		'/invoice/nfe/emit/:orderId',
		{
			preHandler: requireManager,
			schema: {
				params: orderIdParamsSchema,
			},
		},
		emitNfeHandler
	);

	fastify.post(
		'/invoice/nfe/test/:orderId',
		{
			preHandler: requireManager,
			schema: {
				params: orderIdParamsSchema,
			},
		},
		emitNfeTestHandler
	);

	fastify.post(
		'/invoice/nfce/emit/:orderId',
		{
			preHandler: requireManager,
			schema: {
				params: orderIdParamsSchema,
			},
		},
		emitNfceHandler
	);

	fastify.post(
		'/invoice/nfce/test/:orderId',
		{
			preHandler: requireManager,
			schema: {
				params: orderIdParamsSchema,
			},
		},
		emitNfceTestHandler
	);
}

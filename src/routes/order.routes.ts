import type { FastifyInstance, RouteHandlerMethod } from 'fastify';
import { getAdminOrders, updateAdminOrderStatus } from '../controllers/order.controller.js';
import { requireManager } from '../middleware/auth.middleware.js';

const getAdminOrdersHandler = getAdminOrders as unknown as RouteHandlerMethod;
const updateAdminOrderStatusHandler = updateAdminOrderStatus as unknown as RouteHandlerMethod;

const orderIdParamsSchema = {
	properties: {
		id: { type: 'string' },
	},
	required: ['id'],
	type: 'object',
} as const;

export async function orderRoutes(fastify: FastifyInstance) {
	fastify.get(
		'/admin/orders',
		{
			preHandler: requireManager,
		},
		getAdminOrdersHandler
	);

	fastify.patch(
		'/admin/orders/:id/status',
		{
			preHandler: requireManager,
			schema: {
				params: orderIdParamsSchema,
			},
		},
		updateAdminOrderStatusHandler
	);

	fastify.put(
		'/admin/orders/:id/status',
		{
			preHandler: requireManager,
			schema: {
				params: orderIdParamsSchema,
			},
		},
		updateAdminOrderStatusHandler
	);
}

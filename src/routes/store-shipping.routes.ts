import type { FastifyInstance, RouteHandlerMethod } from 'fastify';
import {
	getStoreShippingSummary,
	updateStoreDefaultShipping,
	upsertStoreNeighborhoodShipping,
} from '../controllers/store-shipping.controller.js';
import { requireManager } from '../middleware/auth.middleware.js';

const getStoreShippingSummaryHandler = getStoreShippingSummary as unknown as RouteHandlerMethod;
const upsertStoreNeighborhoodShippingHandler =
	upsertStoreNeighborhoodShipping as unknown as RouteHandlerMethod;
const updateStoreDefaultShippingHandler =
	updateStoreDefaultShipping as unknown as RouteHandlerMethod;

export async function storeShippingRoutes(fastify: FastifyInstance) {
	fastify.get(
		'/admin/store-shipping/summary',
		{
			preHandler: requireManager,
		},
		getStoreShippingSummaryHandler
	);

	fastify.put(
		'/admin/store-shipping/default',
		{
			preHandler: requireManager,
		},
		updateStoreDefaultShippingHandler
	);

	fastify.put(
		'/admin/store-shipping/neighborhood',
		{
			preHandler: requireManager,
		},
		upsertStoreNeighborhoodShippingHandler
	);
}

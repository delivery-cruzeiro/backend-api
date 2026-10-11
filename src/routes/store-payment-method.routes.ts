import type { FastifyInstance, RouteHandlerMethod } from 'fastify';
import {
	createStorePaymentMethod,
	listActiveStorePaymentMethods,
	listStorePaymentMethods,
	updateStorePaymentMethod,
} from '../controllers/store-payment-method.controller.js';
import { authenticate, requireManager } from '../middleware/auth.middleware.js';

export async function storePaymentMethodRoutes(fastify: FastifyInstance) {
	fastify.get('/store-payment-methods', { preHandler: requireManager }, listStorePaymentMethods as RouteHandlerMethod);
	fastify.post('/store-payment-methods', { preHandler: requireManager }, createStorePaymentMethod as RouteHandlerMethod);
	fastify.put('/store-payment-methods/:id', { preHandler: requireManager }, updateStorePaymentMethod as RouteHandlerMethod);
	fastify.get('/client/store-payment-methods', { preHandler: authenticate }, listActiveStorePaymentMethods as RouteHandlerMethod);
}

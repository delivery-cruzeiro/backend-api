import type { FastifyInstance, RouteHandlerMethod } from 'fastify';
import {
	createClientAddress,
	createClientOrder,
	createClientPaymentMethod,
	deactivateClientAccount,
	deleteClientAddress,
	getClientAddresses,
	getClientOrderById,
	getClientOrders,
	getClientPaymentMethods,
	getClientProfile,
	updateClientAddress,
	updateClientProfile,
} from '../controllers/client.controller.js';
import { authenticate } from '../middleware/auth.middleware.js';

const createClientAddressHandler = createClientAddress as unknown as RouteHandlerMethod;
const createClientOrderHandler = createClientOrder as unknown as RouteHandlerMethod;
const createClientPaymentMethodHandler = createClientPaymentMethod as unknown as RouteHandlerMethod;
const deleteClientAddressHandler = deleteClientAddress as unknown as RouteHandlerMethod;
const getClientOrderByIdHandler = getClientOrderById as unknown as RouteHandlerMethod;
const getClientOrdersHandler = getClientOrders as unknown as RouteHandlerMethod;
const updateClientAddressHandler = updateClientAddress as unknown as RouteHandlerMethod;
const updateClientProfileHandler = updateClientProfile as unknown as RouteHandlerMethod;

export async function clientRoutes(fastify: FastifyInstance) {
	fastify.addHook('preHandler', authenticate);

	fastify.get('/client/profile', getClientProfile);
	fastify.put('/client/profile', updateClientProfileHandler);
	fastify.delete('/client/profile', deactivateClientAccount);

	fastify.get('/client/addresses', getClientAddresses);
	fastify.post('/client/addresses', createClientAddressHandler);
	fastify.put('/client/addresses/:id', updateClientAddressHandler);
	fastify.delete('/client/addresses/:id', deleteClientAddressHandler);

	fastify.get('/client/payment-methods', getClientPaymentMethods);
	fastify.post('/client/payment-methods', createClientPaymentMethodHandler);

	fastify.get('/client/orders', getClientOrdersHandler);
	fastify.post('/client/orders', createClientOrderHandler);
	fastify.get('/client/orders/:id', getClientOrderByIdHandler);
}

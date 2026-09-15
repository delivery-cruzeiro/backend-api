import type { FastifyInstance, RouteHandlerMethod } from 'fastify';
import {
	applyClientPromotionCoupon,
	createClientAddress,
	createClientOrder,
	createClientPaymentMethod,
	deactivateClientAccount,
	deleteClientAddress,
	getClientAddresses,
	getClientAddressByZipCode,
	getClientOrderById,
	getClientOrders,
	getClientPaymentMethods,
	getClientProfile,
	getClientShippingQuote,
	searchClientAddressesByLocation,
	updateClientAddress,
	updateClientProfile,
	updateClientPhone,
	sendClientCheckoutPix,
} from '../controllers/client.controller.js';
import { authenticate } from '../middleware/auth.middleware.js';

const createClientAddressHandler = createClientAddress as unknown as RouteHandlerMethod;
const createClientOrderHandler = createClientOrder as unknown as RouteHandlerMethod;
const createClientPaymentMethodHandler = createClientPaymentMethod as unknown as RouteHandlerMethod;
const applyClientPromotionCouponHandler =
	applyClientPromotionCoupon as unknown as RouteHandlerMethod;
const deleteClientAddressHandler = deleteClientAddress as unknown as RouteHandlerMethod;
const getClientOrderByIdHandler = getClientOrderById as unknown as RouteHandlerMethod;
const getClientOrdersHandler = getClientOrders as unknown as RouteHandlerMethod;
const getClientShippingQuoteHandler = getClientShippingQuote as unknown as RouteHandlerMethod;
const getClientAddressByZipCodeHandler = getClientAddressByZipCode as unknown as RouteHandlerMethod;
const searchClientAddressesByLocationHandler =
	searchClientAddressesByLocation as unknown as RouteHandlerMethod;
const updateClientAddressHandler = updateClientAddress as unknown as RouteHandlerMethod;
const updateClientProfileHandler = updateClientProfile as unknown as RouteHandlerMethod;

export async function clientRoutes(fastify: FastifyInstance) {
	fastify.addHook('preHandler', authenticate);

	fastify.get('/client/profile', getClientProfile);
	fastify.patch('/client/profile/phone', updateClientPhone);
	fastify.post('/client/checkout/pix', sendClientCheckoutPix);
	fastify.put('/client/profile', updateClientProfileHandler);
	fastify.delete('/client/profile', deactivateClientAccount);

	fastify.get('/client/addresses', getClientAddresses);
	fastify.get('/client/address-lookup/by-zip', getClientAddressByZipCodeHandler);
	fastify.get('/client/address-lookup/by-address', searchClientAddressesByLocationHandler);
	fastify.post('/client/addresses', createClientAddressHandler);
	fastify.put('/client/addresses/:id', updateClientAddressHandler);
	fastify.delete('/client/addresses/:id', deleteClientAddressHandler);

	fastify.get('/client/payment-methods', getClientPaymentMethods);
	fastify.post('/client/payment-methods', createClientPaymentMethodHandler);

	fastify.get('/client/shipping-quote', getClientShippingQuoteHandler);
	fastify.post('/client/coupons/apply', applyClientPromotionCouponHandler);
	fastify.get('/client/orders', getClientOrdersHandler);
	fastify.post('/client/orders', createClientOrderHandler);
	fastify.get('/client/orders/:id', getClientOrderByIdHandler);
}

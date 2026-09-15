import type { FastifyInstance, RouteHandlerMethod } from 'fastify';
import {
	createPrinterConfiguration,
	deletePrinterConfiguration,
	listPrinterConfigurations,
	setPrinterAssignments,
	updatePrinterConfiguration,
} from '../controllers/printer-configuration.controller.js';
import { requireManager } from '../middleware/auth.middleware.js';

export async function printerConfigurationRoutes(fastify: FastifyInstance) {
	fastify.get('/printer-configurations', {
		preHandler: requireManager,
		handler: listPrinterConfigurations as unknown as RouteHandlerMethod,
	});
	fastify.post('/printer-configurations', {
		preHandler: requireManager,
		handler: createPrinterConfiguration as unknown as RouteHandlerMethod,
	});
	fastify.put('/printer-configurations/:id', {
		preHandler: requireManager,
		handler: updatePrinterConfiguration as unknown as RouteHandlerMethod,
	});
	fastify.put('/printer-configurations/:id/assignments', {
		preHandler: requireManager,
		handler: setPrinterAssignments as unknown as RouteHandlerMethod,
	});
	fastify.delete('/printer-configurations/:id', {
		preHandler: requireManager,
		handler: deletePrinterConfiguration as unknown as RouteHandlerMethod,
	});
}

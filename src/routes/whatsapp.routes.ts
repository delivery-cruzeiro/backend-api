import type { FastifyInstance } from 'fastify';
import {
	connectWhatsApp,
	disconnectWhatsApp,
	getWhatsAppQrCode,
	getWhatsAppStatus,
} from '../controllers/whatsapp.controller.js';
import { requireAdmin } from '../middleware/auth.middleware.js';
import {
	createWhatsAppMessageConfiguration,
	listWhatsAppMessageConfigurations,
	updateWhatsAppMessageConfiguration,
	uploadWhatsAppMessageImage,
} from '../controllers/whatsapp-message-configuration.controller.js';
import type { RouteHandlerMethod } from 'fastify';

const createMessageConfigurationHandler =
	createWhatsAppMessageConfiguration as unknown as RouteHandlerMethod;
const updateMessageConfigurationHandler =
	updateWhatsAppMessageConfiguration as unknown as RouteHandlerMethod;

const statusSchema = {
	type: 'object',
	required: ['connected', 'status'],
	properties: {
		connected: { type: 'boolean' },
		status: {
			type: 'string',
			enum: ['DISCONNECTED', 'CONNECTING', 'WAITING_QR_CODE', 'CONNECTED', 'ERROR'],
		},
		phone: { type: 'string' },
		name: { type: 'string' },
	},
};

const qrCodeSchema = {
	type: 'object',
	required: ['mimeType', 'data'],
	properties: {
		mimeType: { type: 'string', enum: ['image/png'] },
		data: { type: 'string' },
	},
};

const errorSchema = {
	type: 'object',
	required: ['error'],
	properties: { code: { type: 'string' }, error: { type: 'string' } },
};

export async function whatsappRoutes(fastify: FastifyInstance) {
	fastify.get('/whatsapp/message-configurations', {
		preHandler: requireAdmin,
		handler: listWhatsAppMessageConfigurations,
	});

	fastify.post('/whatsapp/message-configurations', {
		preHandler: requireAdmin,
		handler: createMessageConfigurationHandler,
	});

	fastify.put('/whatsapp/message-configurations/:id', {
		preHandler: requireAdmin,
		handler: updateMessageConfigurationHandler,
	});

	fastify.post('/whatsapp/message-images', {
		preHandler: requireAdmin,
		handler: uploadWhatsAppMessageImage,
	});

	fastify.get('/whatsapp/status', {
		preHandler: requireAdmin,
		schema: {
			tags: ['WhatsApp'],
			response: {
				200: statusSchema,
				500: errorSchema,
				502: errorSchema,
				503: errorSchema,
				504: errorSchema,
			},
		},
		handler: getWhatsAppStatus,
	});

	fastify.post('/whatsapp/connect', {
		preHandler: requireAdmin,
		schema: {
			tags: ['WhatsApp'],
			response: {
				200: statusSchema,
				500: errorSchema,
				502: errorSchema,
				503: errorSchema,
				504: errorSchema,
			},
		},
		handler: connectWhatsApp,
	});

	fastify.get('/whatsapp/qr-code', {
		preHandler: requireAdmin,
		schema: {
			tags: ['WhatsApp'],
			response: {
				200: qrCodeSchema,
				409: errorSchema,
				500: errorSchema,
				502: errorSchema,
				503: errorSchema,
				504: errorSchema,
			},
		},
		handler: getWhatsAppQrCode,
	});

	fastify.post('/whatsapp/disconnect', {
		preHandler: requireAdmin,
		schema: {
			tags: ['WhatsApp'],
			response: {
				200: statusSchema,
				500: errorSchema,
				502: errorSchema,
				503: errorSchema,
				504: errorSchema,
			},
		},
		handler: disconnectWhatsApp,
	});
}

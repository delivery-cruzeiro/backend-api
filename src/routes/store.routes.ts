import type { FastifyInstance } from 'fastify';
import { getStores, updateStoreLayout } from '../controllers/store.controller.js';
import { requireManager } from '../middleware/auth.middleware.js';

const storeSchema = {
	type: 'object',
	properties: {
		address: {
			type: 'object',
			properties: {
				city: { type: 'string' },
				cityCode: { type: ['string', 'null'] },
				complement: { type: ['string', 'null'] },
				id: { type: 'string' },
				latitude: { type: ['number', 'null'] },
				longitude: { type: ['number', 'null'] },
				neighborhood: { type: 'string' },
				number: { type: 'string' },
				state: { type: 'string' },
				street: { type: 'string' },
				zipCode: { type: 'string' },
			},
		},
		id: { type: 'string' },
		name: { type: 'string' },
		nickname: { type: 'string' },
		isActive: { type: 'boolean' },
		isClosed: { type: 'boolean' },
		layout: {
			type: 'string',
			enum: ['QUIET_OPS', 'MOTION_CANVAS', 'CRAVE_MARKET'],
		},
	},
};

export async function storeRoutes(fastify: FastifyInstance) {
	fastify.get(
		'/stores',
		{
			schema: {
				description: 'Listar lojas ativas',
				tags: ['Lojas'],
				response: {
					200: {
						type: 'object',
						properties: {
							stores: {
								type: 'array',
								items: storeSchema,
							},
							total: { type: 'number' },
						},
					},
				},
			},
		},
		getStores
	);

	fastify.put('/stores/:id/layout', {
		preHandler: requireManager,
		schema: {
			description: 'Atualizar o layout visual da loja selecionada',
			tags: ['Lojas'],
			body: {
				type: 'object',
				required: ['layout'],
				additionalProperties: false,
				properties: {
					layout: {
						type: 'string',
						enum: ['QUIET_OPS', 'MOTION_CANVAS', 'CRAVE_MARKET'],
					},
				},
			},
			response: {
				200: {
					type: 'object',
					required: ['message', 'store'],
					properties: {
						message: { type: 'string' },
						store: storeSchema,
					},
				},
			},
		},
		handler: updateStoreLayout,
	});
}

import type { FastifyInstance } from 'fastify';
import { getStores } from '../controllers/store.controller.js';

const storeSchema = {
	type: 'object',
	properties: {
		id: { type: 'string' },
		name: { type: 'string' },
		nickname: { type: 'string' },
		isActive: { type: 'boolean' },
		isClosed: { type: 'boolean' },
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
}

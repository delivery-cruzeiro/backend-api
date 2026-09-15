import type { FastifyInstance, RouteHandlerMethod } from 'fastify';
import {
	createBadge,
	deleteBadge,
	getBadge,
	listBadges,
	setBadgeProducts,
	updateBadge,
} from '../controllers/badge.controller.js';
import { requireManager } from '../middleware/auth.middleware.js';

const badgeSchema = {
	type: 'object',
	required: [
		'id',
		'name',
		'isActive',
		'color',
		'storeId',
		'productIds',
		'createdAt',
		'updatedAt',
	],
	properties: {
		id: { type: 'string' },
		name: { type: 'string' },
		isActive: { type: 'boolean' },
		color: { type: 'string' },
		icon: { type: 'string', nullable: true },
		storeId: { type: 'string' },
		productIds: { type: 'array', items: { type: 'string' } },
		createdAt: { type: 'string' },
		updatedAt: { type: 'string' },
	},
};

const createHandler = createBadge as unknown as RouteHandlerMethod;
const updateHandler = updateBadge as unknown as RouteHandlerMethod;
const setProductsHandler = setBadgeProducts as unknown as RouteHandlerMethod;
const deleteHandler = deleteBadge as unknown as RouteHandlerMethod;

export async function badgeRoutes(fastify: FastifyInstance) {
	fastify.get('/badges', {
		preHandler: requireManager,
		schema: {
			tags: ['Badges'],
			response: {
				200: {
					type: 'object',
					required: ['badges', 'total'],
					properties: {
						badges: { type: 'array', items: badgeSchema },
						total: { type: 'number' },
					},
				},
			},
		},
		handler: listBadges,
	});

	fastify.get('/badges/:id', {
		preHandler: requireManager,
		schema: {
			tags: ['Badges'],
			response: {
				200: {
					type: 'object',
					required: ['badge'],
					properties: { badge: badgeSchema },
				},
			},
		},
		handler: getBadge,
	});

	fastify.post('/badges', { preHandler: requireManager }, createHandler);
	fastify.put('/badges/:id', { preHandler: requireManager }, updateHandler);
	fastify.put(
		'/badges/:id/products',
		{ preHandler: requireManager },
		setProductsHandler
	);
	fastify.delete('/badges/:id', { preHandler: requireManager }, deleteHandler);
}

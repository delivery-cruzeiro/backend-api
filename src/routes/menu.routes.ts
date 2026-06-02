import type { FastifyInstance, RouteHandlerMethod } from 'fastify';
import { createMenu, deleteMenu, getMenus, updateMenu } from '../controllers/menu.controller.js';
import { requireManager } from '../middleware/auth.middleware.js';

const createMenuHandler = createMenu as unknown as RouteHandlerMethod;
const deleteMenuHandler = deleteMenu as unknown as RouteHandlerMethod;
const updateMenuHandler = updateMenu as unknown as RouteHandlerMethod;

const storeSummarySchema = {
	type: 'object',
	properties: {
		id: { type: 'string' },
		name: { type: 'string' },
		nickname: { type: 'string' },
		isActive: { type: 'boolean' },
	},
};

const categorySchema = {
	type: 'object',
	properties: {
		id: { type: 'string' },
		name: { type: 'string' },
		description: { type: 'string', nullable: true },
		imageUrl: { type: 'string', nullable: true },
		order: { type: 'number' },
		isActive: { type: 'boolean' },
		createdAt: { type: 'string' },
		updatedAt: { type: 'string' },
		stores: {
			type: 'array',
			items: storeSummarySchema,
		},
	},
};

const subcategorySchema = {
	type: 'object',
	properties: {
		...categorySchema.properties,
		categoryId: { type: 'string' },
		category: {
			type: 'object',
			properties: {
				id: { type: 'string' },
				name: { type: 'string' },
			},
		},
	},
};

const menuSchema = {
	type: 'object',
	properties: {
		...categorySchema.properties,
		categories: {
			type: 'array',
			items: categorySchema,
		},
		subcategories: {
			type: 'array',
			items: subcategorySchema,
		},
		stores: {
			type: 'array',
			items: storeSummarySchema,
		},
	},
};

export async function menuRoutes(fastify: FastifyInstance) {
	fastify.get(
		'/menus',
		{
			schema: {
				description: 'Listar menus',
				tags: ['Menus'],
				response: {
					200: {
						type: 'object',
						properties: {
							menus: {
								type: 'array',
								items: menuSchema,
							},
							total: { type: 'number' },
						},
					},
				},
			},
		},
		getMenus
	);

	fastify.post(
		'/menus',
		{
			preHandler: requireManager,
		},
		createMenuHandler
	);

	fastify.put(
		'/menus/:id',
		{
			preHandler: requireManager,
			schema: {
				params: {
					type: 'object',
					required: ['id'],
					properties: {
						id: { type: 'string' },
					},
				},
			},
		},
		updateMenuHandler
	);

	fastify.delete(
		'/menus/:id',
		{
			preHandler: requireManager,
			schema: {
				params: {
					type: 'object',
					required: ['id'],
					properties: {
						id: { type: 'string' },
					},
				},
			},
		},
		deleteMenuHandler
	);
}

import type { FastifyInstance, RouteHandlerMethod } from 'fastify';
import {
	createSubcategory,
	deleteSubcategory,
	getSubcategories,
	updateSubcategory,
} from '../controllers/subcategory.controller.js';
import { requireManager } from '../middleware/auth.middleware.js';

const createSubcategoryHandler = createSubcategory as unknown as RouteHandlerMethod;
const deleteSubcategoryHandler = deleteSubcategory as unknown as RouteHandlerMethod;
const updateSubcategoryHandler = updateSubcategory as unknown as RouteHandlerMethod;

const storeSummarySchema = {
	type: 'object',
	properties: {
		id: { type: 'string' },
		name: { type: 'string' },
		nickname: { type: 'string' },
		isActive: { type: 'boolean' },
	},
};

const additionalFieldSchema = {
	type: 'object',
	properties: {
		additionalValue: { type: 'number', minimum: 0, maximum: 999.99 },
		id: { type: 'string' },
		label: { type: 'string' },
		required: { type: 'boolean', default: false },
		minQuantity: { type: 'integer', minimum: 0, maximum: 999 },
		maxQuantity: { type: 'integer', minimum: 0, maximum: 999 },
		quantityOptions: { type: 'array', items: { type: 'object', properties: {
			id: { type: 'string' }, label: { type: 'string' },
			additionalValue: { type: 'number', minimum: 0, maximum: 999.99 },
			minQuantity: { type: 'integer', minimum: 0, maximum: 999 },
			maxQuantity: { type: 'integer', minimum: 0, maximum: 999 },
		} } },
		options: { type: 'array', items: { type: 'string' } },
		type: { type: 'string', enum: ['COMBOBOX', 'CHECKBOX', 'TEXT', 'RADIO', 'MULTI_OPTION'] },
	},
};

const subcategorySchema = {
	type: 'object',
	properties: {
		additionalFields: { type: 'array', items: additionalFieldSchema },
		id: { type: 'string' },
		categoryId: { type: 'string' },
		category: {
			type: 'object',
			properties: {
				id: { type: 'string' },
				name: { type: 'string' },
			},
		},
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

export async function subcategoryRoutes(fastify: FastifyInstance) {
	fastify.get(
		'/subcategories',
		{
			schema: {
				description: 'Listar subcategorias',
				tags: ['Subcategorias'],
				response: {
					200: {
						type: 'object',
						properties: {
							subcategories: {
								type: 'array',
								items: subcategorySchema,
							},
							total: { type: 'number' },
						},
					},
				},
			},
		},
		getSubcategories
	);

	fastify.post(
		'/subcategories',
		{
			preHandler: requireManager,
		},
		createSubcategoryHandler
	);

	fastify.put(
		'/subcategories/:id',
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
		updateSubcategoryHandler
	);

	fastify.delete(
		'/subcategories/:id',
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
		deleteSubcategoryHandler
	);
}

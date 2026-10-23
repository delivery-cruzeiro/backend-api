import type { FastifyInstance, RouteHandlerMethod } from 'fastify';
import {
	createCategory,
	deleteCategory,
	getCategories,
	updateCategory,
} from '../controllers/category.controller.js';
import { requireManager } from '../middleware/auth.middleware.js';

const createCategoryHandler = createCategory as unknown as RouteHandlerMethod;
const deleteCategoryHandler = deleteCategory as unknown as RouteHandlerMethod;
const updateCategoryHandler = updateCategory as unknown as RouteHandlerMethod;

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

export async function categoryRoutes(fastify: FastifyInstance) {
	fastify.get(
		'/categories',
		{
			schema: {
				description: 'Listar categorias',
				tags: ['Categorias'],
				response: {
					200: {
						type: 'object',
						properties: {
							categories: {
								type: 'array',
								items: {
									type: 'object',
									properties: {
										additionalFields: { type: 'array', items: additionalFieldSchema },
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
								},
							},
							total: { type: 'number' },
						},
					},
				},
			},
		},
		getCategories
	);

	fastify.post(
		'/categories',
		{
			preHandler: requireManager,
			schema: {
				description: 'Criar categoria',
				tags: ['Categorias'],
				consumes: ['multipart/form-data', 'application/json'],
				response: {
					201: {
						type: 'object',
						properties: {
							message: { type: 'string' },
							category: {
								type: 'object',
								properties: {
									additionalFields: { type: 'array', items: additionalFieldSchema },
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
							},
						},
					},
					400: {
						type: 'object',
						properties: {
							error: { type: 'string' },
						},
					},
					409: {
						type: 'object',
						properties: {
							error: { type: 'string' },
						},
					},
				},
			},
		},
		createCategoryHandler
	);

	fastify.delete(
		'/categories/:id',
		{
			preHandler: requireManager,
			schema: {
				description: 'Deletar categoria',
				tags: ['Categorias'],
				params: {
					type: 'object',
					required: ['id'],
					properties: {
						id: { type: 'string' },
					},
				},
				response: {
					200: {
						type: 'object',
						properties: {
							message: { type: 'string' },
						},
					},
					404: {
						type: 'object',
						properties: {
							error: { type: 'string' },
						},
					},
				},
			},
		},
		deleteCategoryHandler
	);

	fastify.put(
		'/categories/:id',
		{
			preHandler: requireManager,
			schema: {
				description: 'Atualizar categoria',
				tags: ['Categorias'],
				consumes: ['multipart/form-data', 'application/json'],
				params: {
					type: 'object',
					required: ['id'],
					properties: {
						id: { type: 'string' },
					},
				},
			},
		},
		updateCategoryHandler
	);
}

import type { FastifyInstance, RouteHandlerMethod } from 'fastify';
import {
	bulkUpdateProducts,
	createProduct,
	deleteProduct,
	getProducts,
	updateProduct,
} from '../controllers/product.controller.js';
import { requireManager } from '../middleware/auth.middleware.js';

const createProductHandler = createProduct as unknown as RouteHandlerMethod;
const updateProductHandler = updateProduct as unknown as RouteHandlerMethod;
const deleteProductHandler = deleteProduct as unknown as RouteHandlerMethod;
const bulkUpdateProductsHandler = bulkUpdateProducts as unknown as RouteHandlerMethod;

const storeSummarySchema = {
	type: 'object',
	properties: {
		id: { type: 'string' },
		name: { type: 'string' },
		nickname: { type: 'string' },
		isActive: { type: 'boolean' },
	},
};

export async function productRoutes(fastify: FastifyInstance) {
	fastify.get(
		'/products',
		{
			schema: {
				description: 'Listar produtos',
				tags: ['Produtos'],
				response: {
					200: {
						type: 'object',
						properties: {
							products: {
								type: 'array',
								items: {
									type: 'object',
									properties: {
										id: { type: 'string' },
										categoryId: { type: 'string' },
										category: {
											type: 'object',
											properties: {
												id: { type: 'string' },
												name: { type: 'string' },
											},
										},
										subcategoryId: { type: 'string', nullable: true },
										subcategory: {
											type: 'object',
											nullable: true,
											properties: {
												id: { type: 'string' },
												name: { type: 'string' },
											},
										},
										name: { type: 'string' },
										description: { type: 'string' },
										price: { type: 'number' },
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
		getProducts
	);

	fastify.post(
		'/products',
		{
			preHandler: requireManager,
			schema: {
				description: 'Criar produto',
				tags: ['Produtos'],
				consumes: ['multipart/form-data', 'application/json'],
				response: {
					201: {
						type: 'object',
						properties: {
							message: { type: 'string' },
							product: {
								type: 'object',
								properties: {
									id: { type: 'string' },
									categoryId: { type: 'string' },
									category: {
										type: 'object',
										properties: {
											id: { type: 'string' },
											name: { type: 'string' },
										},
									},
									subcategoryId: { type: 'string', nullable: true },
									subcategory: {
										type: 'object',
										nullable: true,
										properties: {
											id: { type: 'string' },
											name: { type: 'string' },
										},
									},
									name: { type: 'string' },
									description: { type: 'string' },
									price: { type: 'number' },
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
					404: {
						type: 'object',
						properties: {
							error: { type: 'string' },
						},
					},
				},
			},
		},
		createProductHandler
	);

	fastify.put(
		'/products/bulk-update',
		{
			preHandler: requireManager,
		},
		bulkUpdateProductsHandler
	);

	fastify.put(
		'/products/:id',
		{
			preHandler: requireManager,
			schema: {
				description: 'Atualizar produto',
				tags: ['Produtos'],
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
		updateProductHandler
	);

	fastify.delete(
		'/products/:id',
		{
			preHandler: requireManager,
			schema: {
				description: 'Deletar produto',
				tags: ['Produtos'],
				params: {
					type: 'object',
					required: ['id'],
					properties: {
						id: { type: 'string' },
					},
				},
			},
		},
		deleteProductHandler
	);
}

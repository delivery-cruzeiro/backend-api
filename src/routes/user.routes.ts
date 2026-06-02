import type { FastifyInstance, RouteHandlerMethod } from 'fastify';
import { createUserSchema, updateUserSchema } from '@delivery-cruzeiro/types';
import {
	createUser,
	deleteUser,
	getUserById,
	getUsers,
	updateUser,
} from '../controllers/user.controller.js';
import { requireAdmin } from '../middleware/auth.middleware.js';
import { validateZod } from '../middleware/validate-zod.middleware.js';

const createUserHandler = createUser as unknown as RouteHandlerMethod;
const getUserByIdHandler = getUserById as unknown as RouteHandlerMethod;
const updateUserHandler = updateUser as unknown as RouteHandlerMethod;
const deleteUserHandler = deleteUser as unknown as RouteHandlerMethod;

const storeSummarySchema = {
	type: 'object',
	properties: {
		id: { type: 'string' },
		name: { type: 'string' },
		nickname: { type: 'string' },
		isActive: { type: 'boolean' },
	},
};

export async function userRoutes(fastify: FastifyInstance) {
	// Criar novo usuário (rota solicitada)
	fastify.post(
		'/new-user',
		{
			preValidation: validateZod(createUserSchema),
			preHandler: requireAdmin,
			schema: {
				description: 'Criar um novo usuário',
				tags: ['Usuários'],
				body: {
					type: 'object',
					required: ['email', 'password', 'name'],
					properties: {
						email: { type: 'string', format: 'email' },
						password: { type: 'string', minLength: 8 },
						name: { type: 'string' },
						phone: { type: 'string', nullable: true },
						role: {
							type: 'string',
							enum: ['CLIENT', 'ADMIN', 'MANAGER', 'SUPER_ADMIN'],
							default: 'CLIENT',
						},
						storeIds: {
							type: 'array',
							items: { type: 'string' },
						},
					},
				},
				response: {
					201: {
						type: 'object',
						properties: {
							message: { type: 'string' },
							user: {
								type: 'object',
								properties: {
									id: { type: 'string' },
									email: { type: 'string' },
									name: { type: 'string' },
									phone: { type: 'string', nullable: true },
									avatar: { type: 'string', nullable: true },
									role: { type: 'string' },
									isActive: { type: 'boolean' },
									emailVerified: { type: 'boolean' },
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
		createUserHandler
	);

	// Listar todos os usuários
	fastify.get(
		'/users',
		{
			preHandler: requireAdmin,
			schema: {
				description: 'Listar todos os usuários',
				tags: ['Usuários'],
				response: {
					200: {
						type: 'object',
						properties: {
							users: {
								type: 'array',
								items: {
									type: 'object',
									properties: {
										id: { type: 'string' },
										email: { type: 'string' },
										name: { type: 'string' },
										phone: { type: 'string', nullable: true },
										avatar: { type: 'string', nullable: true },
										role: { type: 'string' },
										isActive: { type: 'boolean' },
										emailVerified: { type: 'boolean' },
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
		getUsers
	);

	// Buscar usuário por ID
	fastify.get(
		'/users/:id',
		{
			preHandler: requireAdmin,
			schema: {
				description: 'Buscar usuário por ID',
				tags: ['Usuários'],
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
							user: {
								type: 'object',
								properties: {
									id: { type: 'string' },
									email: { type: 'string' },
									name: { type: 'string' },
									phone: { type: 'string', nullable: true },
									avatar: { type: 'string', nullable: true },
									role: { type: 'string' },
									isActive: { type: 'boolean' },
									emailVerified: { type: 'boolean' },
									createdAt: { type: 'string' },
									updatedAt: { type: 'string' },
									stores: {
										type: 'array',
										items: storeSummarySchema,
									},
									addresses: { type: 'array' },
									paymentMethods: { type: 'array' },
									orders: {
										type: 'array',
										items: {
											type: 'object',
											properties: {
												id: { type: 'string' },
												status: { type: 'string' },
												total: { type: 'number' },
												createdAt: { type: 'string' },
											},
										},
									},
								},
							},
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
		getUserByIdHandler
	);

	// Atualizar usuário
	fastify.put(
		'/users/:id',
		{
			preValidation: validateZod(updateUserSchema),
			preHandler: requireAdmin,
			schema: {
				description: 'Atualizar usuário',
				tags: ['Usuários'],
				params: {
					type: 'object',
					required: ['id'],
					properties: {
						id: { type: 'string' },
					},
				},
				body: {
					type: 'object',
					properties: {
						email: { type: 'string', format: 'email' },
						name: { type: 'string' },
						phone: { type: 'string', nullable: true },
						role: {
							type: 'string',
							enum: ['CLIENT', 'ADMIN', 'MANAGER', 'SUPER_ADMIN'],
						},
						isActive: { type: 'boolean' },
						storeIds: {
							type: 'array',
							items: { type: 'string' },
						},
					},
				},
				response: {
					200: {
						type: 'object',
						properties: {
							message: { type: 'string' },
							user: {
								type: 'object',
								properties: {
									id: { type: 'string' },
									email: { type: 'string' },
									name: { type: 'string' },
									phone: { type: 'string', nullable: true },
									avatar: { type: 'string', nullable: true },
									role: { type: 'string' },
									isActive: { type: 'boolean' },
									emailVerified: { type: 'boolean' },
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
					404: {
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
		updateUserHandler
	);

	// Deletar usuário
	fastify.delete(
		'/users/:id',
		{
			preHandler: requireAdmin,
			schema: {
				description: 'Deletar usuário',
				tags: ['Usuários'],
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
		deleteUserHandler
	);
}

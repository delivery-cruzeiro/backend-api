import type { FastifyInstance } from 'fastify';
import { loginUserSchema, registerUserSchema } from '@delivery-cruzeiro/types';
import { register, login, logout, getMe, refreshToken } from '../controllers/auth.controller.js';
import { validateZod } from '../middleware/validate-zod.middleware.js';

export async function authRoutes(fastify: FastifyInstance) {
	// Registro de usuário (rota customizada)
	fastify.post(
		'/auth/register',
		{
			preValidation: validateZod(registerUserSchema),
			schema: {
				description: 'Registrar um novo usuário',
				tags: ['Autenticação'],
				body: {
					type: 'object',
					required: ['email', 'password', 'name'],
					properties: {
						email: { type: 'string', format: 'email' },
						password: { type: 'string', minLength: 8 },
						name: { type: 'string' },
						phone: { type: 'string', nullable: true },
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
				},
			},
		},
		register
	);

	// Login (rota customizada)
	fastify.post(
		'/auth/login',
		{
			preValidation: validateZod(loginUserSchema),
			schema: {
				description: 'Fazer login',
				tags: ['Autenticação'],
				body: {
					type: 'object',
					required: ['email', 'password'],
					properties: {
						email: { type: 'string', format: 'email' },
						password: { type: 'string' },
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
								},
							},
							session: {
								type: 'object',
								nullable: true,
								properties: {
									expiresAt: { type: 'string' },
								},
							},
						},
					},
					401: {
						type: 'object',
						properties: {
							error: { type: 'string' },
						},
					},
				},
			},
		},
		login
	);

	// Logout (rota customizada)
	fastify.post(
		'/auth/logout',
		{
			schema: {
				description: 'Fazer logout',
				tags: ['Autenticação'],
				response: {
					200: {
						type: 'object',
						properties: {
							message: { type: 'string' },
						},
					},
				},
			},
		},
		logout
	);

	// Obter usuário atual (rota customizada)
	fastify.get(
		'/auth/me',
		{
			schema: {
				description: 'Obter usuário autenticado',
				tags: ['Autenticação'],
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
								},
							},
						},
					},
					401: {
						type: 'object',
						properties: {
							error: { type: 'string' },
						},
					},
				},
			},
		},
		getMe
	);

	// Refresh token (rota customizada)
	fastify.post(
		'/auth/refresh',
		{
			schema: {
				description: 'Refresh token',
				tags: ['Autenticação'],
				response: {
					200: {
						type: 'object',
						properties: {
							user: {
								type: 'object',
								nullable: true,
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
								},
							},
							session: {
								type: 'object',
								nullable: true,
								properties: {
									expiresAt: { type: 'string' },
								},
							},
						},
					},
					401: {
						type: 'object',
						properties: {
							error: { type: 'string' },
						},
					},
				},
			},
		},
		refreshToken
	);
}

import type { FastifyInstance, RouteHandlerMethod } from 'fastify';
import { loginUserSchema, registerUserSchema } from '@delivery-cruzeiro/types';
import { register, login, logout, getMe, refreshToken } from '../controllers/auth.controller.js';
import { limitLogin } from '../security/login-limit.js';
import { passwordRecoveryRoutes } from './password-recovery.routes.js';
import { validateZod } from '../middleware/validate-zod.middleware.js';
import { authenticate, type AuthenticatedRequest } from '../middleware/auth.middleware.js';
import { emailConfirmation, EmailConfirmationError } from '../services/email-confirmation.service.js';

export async function authRoutes(fastify: FastifyInstance) {
	await fastify.register(passwordRecoveryRoutes);
	fastify.addHook('onClose', () => emailConfirmation.waitForDeliveries());
	fastify.post<{ Body: { code: string } }>('/auth/email-confirmation/confirm', {
		config: { rateLimit: { max: 30, timeWindow: '15 minutes' } },
		schema: { body: { type: 'object', required: ['code'], additionalProperties: false,
			properties: { code: { type: 'string', pattern: '^[a-f0-9]{64}$' } } } },
	}, async (request, reply) => {
		if (!(await emailConfirmation.confirm(request.body.code))) {
			return reply.code(400).send({ error: 'Link inválido ou expirado. Solicite um novo e-mail no seu perfil.' });
		}
		return reply.send({ message: 'E-mail confirmado com sucesso.' });
	});
	fastify.post('/auth/email-confirmation/resend', {
		preHandler: authenticate,
		config: { rateLimit: { max: 20, timeWindow: '15 minutes' } },
	}, async (request: AuthenticatedRequest, reply) => {
		try {
			return reply.send({ message: await emailConfirmation.send(request.user!.id) });
		} catch (error) {
			if (!(error instanceof EmailConfirmationError)) throw error;
			if (error.retryAfter) reply.header('Retry-After', error.retryAfter);
			return reply.code(error.statusCode).send({ error: error.message });
		}
	});
	// Registro de usuário (rota customizada)
	fastify.post(
		'/auth/register',
		{
			config: { rateLimit: { max: 6, timeWindow: '15 minutes' } },
			preValidation: validateZod(registerUserSchema),
			schema: {
				description: 'Registrar um novo usuário',
				tags: ['Autenticação'],
				body: {
					type: 'object',
					required: ['email', 'password', 'name', 'phone'],
					properties: {
						email: { type: 'string', format: 'email' },
						password: { type: 'string', minLength: 8, maxLength: 128 },
						name: { type: 'string' },
						cpf: { type: 'string', maxLength: 14, nullable: true },
						phone: { type: 'string', minLength: 1 },
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
									gender: { type: 'string', nullable: true },
									phone: { type: 'string', nullable: true },
									avatar: { type: 'string', nullable: true },
									role: { type: 'integer', minimum: 1 },
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
			preValidation: [limitLogin, validateZod(loginUserSchema)],
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
									gender: { type: 'string', nullable: true },
									phone: { type: 'string', nullable: true },
									avatar: { type: 'string', nullable: true },
									role: { type: 'integer', minimum: 1 },
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
		login as RouteHandlerMethod
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
									gender: { type: 'string', nullable: true },
									phone: { type: 'string', nullable: true },
									avatar: { type: 'string', nullable: true },
									role: { type: 'integer', minimum: 1 },
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
									gender: { type: 'string', nullable: true },
									phone: { type: 'string', nullable: true },
									avatar: { type: 'string', nullable: true },
									role: { type: 'integer', minimum: 1 },
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

import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
	login,
	logout,
	getMe,
	refreshToken,
	register,
} from '../../src/controllers/auth.controller.js';
import { auth } from '../../src/lib/auth.js';
import { prisma } from '../../src/lib/prisma.js';

vi.mock('../../src/lib/prisma', () => ({
	prisma: {
		user: {
			findUnique: vi.fn(),
		},
	},
}));

vi.mock('../../src/lib/auth', () => ({
	auth: {
		handler: vi.fn(),
	},
}));

const publicUser = {
	id: '1',
	email: 'test@example.com',
	name: 'Test User',
	phone: '11999999999',
	avatar: null,
	role: 'CLIENT',
	isActive: true,
	emailVerified: false,
	createdAt: new Date(),
	updatedAt: new Date(),
};

function authResponse(body: Record<string, unknown>, init?: ResponseInit) {
	return new Response(JSON.stringify(body), {
		status: 200,
		headers: {
			'content-type': 'application/json',
			'set-cookie': 'delivery-cruzeiro.session_token=test; HttpOnly',
		},
		...init,
	});
}

describe('Auth Controller', () => {
	let mockRequest: any;
	let mockReply: any;

	beforeEach(() => {
		mockRequest = {
			body: {},
			headers: {},
			log: {
				error: vi.fn(),
			},
		};

		mockReply = {
			header: vi.fn().mockReturnThis(),
			status: vi.fn().mockReturnThis(),
			send: vi.fn().mockReturnThis(),
		};

		vi.clearAllMocks();
	});

	describe('register', () => {
		it('registra com Better Auth e retorna usuario publico', async () => {
			mockRequest.body = {
				email: publicUser.email,
				password: 'password123',
				name: publicUser.name,
				phone: publicUser.phone,
			};

			(prisma.user.findUnique as any)
				.mockResolvedValueOnce(null)
				.mockResolvedValueOnce(publicUser);
			(auth.handler as any).mockResolvedValue(authResponse({ user: { id: publicUser.id } }));

			await register(mockRequest, mockReply);

			expect(auth.handler).toHaveBeenCalledWith(expect.any(Request));
			expect(mockReply.status).toHaveBeenCalledWith(201);
			expect(mockReply.send).toHaveBeenCalledWith({
				message: 'Usuario criado com sucesso',
				user: publicUser,
				session: null,
			});
		});

		it('retorna erro se email ja existe', async () => {
			mockRequest.body = {
				email: publicUser.email,
				password: 'password123',
				name: publicUser.name,
			};

			(prisma.user.findUnique as any).mockResolvedValue({ id: publicUser.id });

			await register(mockRequest, mockReply);

			expect(auth.handler).not.toHaveBeenCalled();
			expect(mockReply.status).toHaveBeenCalledWith(400);
			expect(mockReply.send).toHaveBeenCalledWith({
				error: 'Email ja cadastrado',
			});
		});
	});

	describe('login', () => {
		it('cria sessao via Better Auth com credenciais validas', async () => {
			mockRequest.body = {
				email: publicUser.email,
				password: 'password123',
			};

			(prisma.user.findUnique as any)
				.mockResolvedValueOnce({ id: publicUser.id, isActive: true })
				.mockResolvedValueOnce(publicUser);
			(auth.handler as any).mockResolvedValue(authResponse({ user: { id: publicUser.id } }));

			await login(mockRequest, mockReply);

			expect(auth.handler).toHaveBeenCalledWith(expect.any(Request));
			expect(mockReply.send).toHaveBeenCalledWith({
				message: 'Login realizado com sucesso',
				user: publicUser,
				session: null,
			});
		});

		it('retorna erro se usuario nao existe', async () => {
			mockRequest.body = {
				email: 'nonexistent@example.com',
				password: 'password123',
			};

			(prisma.user.findUnique as any).mockResolvedValue(null);

			await login(mockRequest, mockReply);

			expect(auth.handler).not.toHaveBeenCalled();
			expect(mockReply.status).toHaveBeenCalledWith(401);
			expect(mockReply.send).toHaveBeenCalledWith({
				error: 'Credenciais invalidas',
			});
		});

		it('retorna erro se Better Auth rejeitar a senha', async () => {
			mockRequest.body = {
				email: publicUser.email,
				password: 'wrongpassword',
			};

			(prisma.user.findUnique as any).mockResolvedValue({
				id: publicUser.id,
				isActive: true,
			});
			(auth.handler as any).mockResolvedValue(
				authResponse({ message: 'Credenciais invalidas' }, { status: 401 })
			);

			await login(mockRequest, mockReply);

			expect(mockReply.status).toHaveBeenCalledWith(401);
			expect(mockReply.send).toHaveBeenCalledWith({
				error: 'Credenciais invalidas',
			});
		});

		it('retorna erro se usuario esta desativado', async () => {
			mockRequest.body = {
				email: publicUser.email,
				password: 'password123',
			};

			(prisma.user.findUnique as any).mockResolvedValue({
				id: publicUser.id,
				isActive: false,
			});

			await login(mockRequest, mockReply);

			expect(auth.handler).not.toHaveBeenCalled();
			expect(mockReply.status).toHaveBeenCalledWith(403);
			expect(mockReply.send).toHaveBeenCalledWith({
				error: 'Usuario desativado',
			});
		});
	});

	describe('logout', () => {
		it('encerra a sessao com Better Auth', async () => {
			(auth.handler as any).mockResolvedValue(authResponse({ success: true }));

			await logout(mockRequest, mockReply);

			expect(auth.handler).toHaveBeenCalledWith(expect.any(Request));
			expect(mockReply.send).toHaveBeenCalledWith({
				message: 'Logout realizado com sucesso',
			});
		});
	});

	describe('getMe', () => {
		it('retorna usuario autenticado', async () => {
			(auth.handler as any).mockResolvedValue(
				authResponse({
					user: { id: publicUser.id },
					session: { expiresAt: new Date().toISOString() },
				})
			);
			(prisma.user.findUnique as any).mockResolvedValue(publicUser);

			await getMe(mockRequest, mockReply);

			expect(mockReply.send).toHaveBeenCalledWith({
				user: publicUser,
				session: expect.any(Object),
			});
		});

		it('retorna erro se nao esta autenticado', async () => {
			(auth.handler as any).mockResolvedValue(authResponse({}, { status: 401 }));

			await getMe(mockRequest, mockReply);

			expect(mockReply.status).toHaveBeenCalledWith(401);
			expect(mockReply.send).toHaveBeenCalledWith({
				error: 'Nao autenticado',
			});
		});
	});

	describe('refreshToken', () => {
		it('renova e retorna sessao se valida', async () => {
			(auth.handler as any).mockResolvedValue(
				authResponse({
					user: { id: publicUser.id },
					session: { expiresAt: new Date().toISOString() },
				})
			);
			(prisma.user.findUnique as any).mockResolvedValue(publicUser);

			await refreshToken(mockRequest, mockReply);

			expect(mockReply.send).toHaveBeenCalledWith({
				user: publicUser,
				session: expect.any(Object),
			});
		});

		it('retorna erro se sessao e invalida', async () => {
			(auth.handler as any).mockResolvedValue(authResponse({}, { status: 401 }));

			await refreshToken(mockRequest, mockReply);

			expect(mockReply.status).toHaveBeenCalledWith(401);
			expect(mockReply.send).toHaveBeenCalledWith({
				error: 'Sessao invalida ou expirada',
			});
		});
	});
});

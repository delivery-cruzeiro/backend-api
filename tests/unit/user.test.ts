import { createUserSchema } from '@delivery-cruzeiro/types';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
	createUser,
	deleteUser,
	getUserById,
	getUsers,
	updateUser,
} from '../../src/controllers/user.controller.js';
import { prisma } from '../../src/lib/prisma.js';
import { validateZod } from '../../src/middleware/validate-zod.middleware.js';
import { ensureDefaultAdminInvariant } from '../../src/services/admin-invariant.service.js';

vi.mock('better-auth/crypto', () => ({
	hashPassword: vi.fn().mockResolvedValue('hashed-password'),
}));

vi.mock('../../src/services/admin-invariant.service', () => ({
	ensureDefaultAdminInvariant: vi.fn(),
}));

vi.mock('../../src/lib/prisma', () => ({
	prisma: {
		account: {
			create: vi.fn(),
		},
		user: {
			findUnique: vi.fn(),
			create: vi.fn(),
			findMany: vi.fn(),
			update: vi.fn(),
			delete: vi.fn(),
		},
	},
}));

describe('User Controller', () => {
	let mockRequest: any;
	let mockReply: any;

	beforeEach(() => {
		mockRequest = {
			body: {},
			params: {},
		};

		mockReply = {
			status: vi.fn().mockReturnThis(),
			send: vi.fn().mockReturnThis(),
		};

		vi.clearAllMocks();
	});

	describe('createUser', () => {
		it('deve criar um novo usuario com credencial Better Auth', async () => {
			const userData = {
				email: 'test@example.com',
				password: 'password123',
				name: 'Test User',
				phone: '11999999999',
				role: 'CLIENT' as const,
			};
			const createdUser = {
				id: '1',
				email: userData.email,
				name: userData.name,
				phone: userData.phone,
				role: userData.role,
				isActive: true,
				emailVerified: false,
				createdAt: new Date(),
				updatedAt: new Date(),
			};

			mockRequest.body = userData;
			(prisma.user.findUnique as any).mockResolvedValue(null);
			(prisma.user.create as any).mockResolvedValue(createdUser);

			await createUser(mockRequest, mockReply);

			expect(prisma.user.create).toHaveBeenCalledWith({
				data: expect.objectContaining({
					email: userData.email,
					password: 'hashed-password',
					role: 'CLIENT',
				}),
				select: expect.any(Object),
			});
			expect(prisma.account.create).toHaveBeenCalledWith({
				data: {
					accountId: createdUser.id,
					providerId: 'credential',
					userId: createdUser.id,
					password: 'hashed-password',
				},
			});
			expect(ensureDefaultAdminInvariant).toHaveBeenCalled();
			expect(mockReply.status).toHaveBeenCalledWith(201);
			expect(mockReply.send).toHaveBeenCalledWith({
				message: 'Usuario criado com sucesso',
				user: createdUser,
			});
		});

		it('deve validar se campos obrigatorios faltam antes do controller', async () => {
			mockRequest.body = {
				email: 'test@example.com',
			};

			await validateZod(createUserSchema)(mockRequest, mockReply);

			expect(mockReply.status).toHaveBeenCalledWith(400);
			expect(mockReply.send).toHaveBeenCalledWith(
				expect.objectContaining({
					code: 'VALIDATION_ERROR',
					error: 'Validation error',
				})
			);
			expect(prisma.user.create).not.toHaveBeenCalled();
		});

		it('deve retornar erro se email ja existe', async () => {
			mockRequest.body = {
				email: 'existing@example.com',
				password: 'password123',
				name: 'Test User',
			};

			(prisma.user.findUnique as any).mockResolvedValue({ id: '1' });

			await createUser(mockRequest, mockReply);

			expect(mockReply.status).toHaveBeenCalledWith(409);
			expect(mockReply.send).toHaveBeenCalledWith({
				error: 'Email ja cadastrado',
			});
		});
	});

	describe('getUsers', () => {
		it('deve listar todos os usuarios', async () => {
			const mockUsers = [
				{
					id: '1',
					email: 'user1@example.com',
					name: 'User 1',
					role: 'CLIENT',
					isActive: true,
					emailVerified: false,
					createdAt: new Date(),
					updatedAt: new Date(),
				},
			];

			(prisma.user.findMany as any).mockResolvedValue(mockUsers);

			await getUsers(mockRequest, mockReply);

			expect(prisma.user.findMany).toHaveBeenCalledWith({
				select: expect.any(Object),
				orderBy: {
					createdAt: 'desc',
				},
			});
			expect(mockReply.send).toHaveBeenCalledWith({
				users: mockUsers,
				total: mockUsers.length,
			});
		});
	});

	describe('getUserById', () => {
		it('deve buscar usuario por ID', async () => {
			const userId = '1';
			const mockUser = {
				id: userId,
				email: 'test@example.com',
				name: 'Test User',
				role: 'CLIENT',
				isActive: true,
				emailVerified: false,
				createdAt: new Date(),
				updatedAt: new Date(),
				addresses: [],
				paymentMethods: [],
				orders: [],
			};

			mockRequest.params = { id: userId };
			(prisma.user.findUnique as any).mockResolvedValue(mockUser);

			await getUserById(mockRequest, mockReply);

			expect(prisma.user.findUnique).toHaveBeenCalledWith({
				where: { id: userId },
				select: expect.any(Object),
			});
			expect(mockReply.send).toHaveBeenCalledWith({
				user: mockUser,
			});
		});

		it('deve retornar erro se usuario nao existe', async () => {
			mockRequest.params = { id: 'nonexistent' };
			(prisma.user.findUnique as any).mockResolvedValue(null);

			await getUserById(mockRequest, mockReply);

			expect(mockReply.status).toHaveBeenCalledWith(404);
			expect(mockReply.send).toHaveBeenCalledWith({
				error: 'Usuario nao encontrado',
			});
		});
	});

	describe('updateUser', () => {
		it('deve atualizar usuario e reconciliar admin padrao', async () => {
			const userId = '1';
			const updateData = {
				name: 'Updated Name',
				phone: '11888888888',
			};
			const existingUser = {
				id: userId,
				email: 'test@example.com',
				name: 'Test User',
			};
			const updatedUser = {
				...existingUser,
				...updateData,
				updatedAt: new Date(),
			};

			mockRequest.params = { id: userId };
			mockRequest.body = updateData;
			(prisma.user.findUnique as any)
				.mockResolvedValueOnce(existingUser)
				.mockResolvedValueOnce(updatedUser);
			(prisma.user.update as any).mockResolvedValue(updatedUser);

			await updateUser(mockRequest, mockReply);

			expect(prisma.user.update).toHaveBeenCalledWith({
				where: { id: userId },
				data: updateData,
				select: expect.any(Object),
			});
			expect(ensureDefaultAdminInvariant).toHaveBeenCalled();
			expect(mockReply.send).toHaveBeenCalledWith({
				message: 'Usuario atualizado com sucesso',
				user: updatedUser,
			});
		});

		it('deve retornar erro se usuario nao existe', async () => {
			mockRequest.params = { id: 'nonexistent' };
			mockRequest.body = { name: 'Updated Name' };
			(prisma.user.findUnique as any).mockResolvedValue(null);

			await updateUser(mockRequest, mockReply);

			expect(mockReply.status).toHaveBeenCalledWith(404);
			expect(mockReply.send).toHaveBeenCalledWith({
				error: 'Usuario nao encontrado',
			});
		});
	});

	describe('deleteUser', () => {
		it('deve deletar usuario e reconciliar admin padrao', async () => {
			const userId = '1';
			const existingUser = {
				id: userId,
				email: 'test@example.com',
			};

			mockRequest.params = { id: userId };
			(prisma.user.findUnique as any).mockResolvedValue(existingUser);
			(prisma.user.delete as any).mockResolvedValue(existingUser);

			await deleteUser(mockRequest, mockReply);

			expect(prisma.user.delete).toHaveBeenCalledWith({
				where: { id: userId },
			});
			expect(ensureDefaultAdminInvariant).toHaveBeenCalled();
			expect(mockReply.send).toHaveBeenCalledWith({
				message: 'Usuario deletado com sucesso',
			});
		});
	});
});

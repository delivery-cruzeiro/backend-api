import { describe, it, expect, beforeEach, vi } from 'vitest';
import bcrypt from 'bcryptjs';
import { createUser, getUsers, getUserById, updateUser, deleteUser } from '../../src/controllers/user.controller.js';
import { prisma } from '../../src/lib/prisma.js';

// Mock do Prisma
vi.mock('../../src/lib/prisma', () => ({
  prisma: {
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
    it('deve criar um novo usuário com sucesso', async () => {
      const userData = {
        email: 'test@example.com',
        password: 'password123',
        name: 'Test User',
        phone: '11999999999',
        role: 'CLIENT' as const,
      };

      mockRequest.body = userData;

      (prisma.user.findUnique as any).mockResolvedValue(null);
      (prisma.user.create as any).mockResolvedValue({
        id: '1',
        email: userData.email,
        name: userData.name,
        phone: userData.phone,
        role: userData.role,
        isActive: true,
        emailVerified: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      await createUser(mockRequest, mockReply);

      expect(prisma.user.findUnique).toHaveBeenCalledWith({
        where: { email: userData.email },
      });

      expect(mockReply.status).toHaveBeenCalledWith(201);
      expect(mockReply.send).toHaveBeenCalledWith({
        message: 'Usuário criado com sucesso',
        user: expect.objectContaining({
          email: userData.email,
          name: userData.name,
        }),
      });
    });

    it('deve retornar erro se campos obrigatórios faltam', async () => {
      mockRequest.body = {
        email: 'test@example.com',
        // password e name faltando
      };

      await createUser(mockRequest, mockReply);

      expect(mockReply.status).toHaveBeenCalledWith(400);
      expect(mockReply.send).toHaveBeenCalledWith({
        error: 'Campos obrigatórios: email, password, name',
      });
    });

    it('deve retornar erro se email é inválido', async () => {
      mockRequest.body = {
        email: 'invalid-email',
        password: 'password123',
        name: 'Test User',
      };

      await createUser(mockRequest, mockReply);

      expect(mockReply.status).toHaveBeenCalledWith(400);
      expect(mockReply.send).toHaveBeenCalledWith({
        error: 'Email inválido',
      });
    });

    it('deve retornar erro se senha é muito curta', async () => {
      mockRequest.body = {
        email: 'test@example.com',
        password: '12345', // 5 caracteres
        name: 'Test User',
      };

      await createUser(mockRequest, mockReply);

      expect(mockReply.status).toHaveBeenCalledWith(400);
      expect(mockReply.send).toHaveBeenCalledWith({
        error: 'A senha deve ter pelo menos 6 caracteres',
      });
    });

    it('deve retornar erro se email já existe', async () => {
      const userData = {
        email: 'existing@example.com',
        password: 'password123',
        name: 'Test User',
      };

      mockRequest.body = userData;

      (prisma.user.findUnique as any).mockResolvedValue({
        id: '1',
        email: userData.email,
      });

      await createUser(mockRequest, mockReply);

      expect(mockReply.status).toHaveBeenCalledWith(409);
      expect(mockReply.send).toHaveBeenCalledWith({
        error: 'Email já cadastrado',
      });
    });

    it('deve fazer hash da senha antes de salvar', async () => {
      const userData = {
        email: 'test@example.com',
        password: 'password123',
        name: 'Test User',
      };

      mockRequest.body = userData;

      (prisma.user.findUnique as any).mockResolvedValue(null);
      (prisma.user.create as any).mockResolvedValue({
        id: '1',
        email: userData.email,
        name: userData.name,
      });

      const bcryptHashSpy = vi.spyOn(bcrypt, 'hash');

      await createUser(mockRequest, mockReply);

      expect(bcryptHashSpy).toHaveBeenCalledWith(userData.password, 10);
    });

    it('deve usar role CLIENT como padrão', async () => {
      const userData = {
        email: 'test@example.com',
        password: 'password123',
        name: 'Test User',
        // role não especificado
      };

      mockRequest.body = userData;

      (prisma.user.findUnique as any).mockResolvedValue(null);
      (prisma.user.create as any).mockResolvedValue({
        id: '1',
        email: userData.email,
        name: userData.name,
        role: 'CLIENT',
      });

      await createUser(mockRequest, mockReply);

      expect(prisma.user.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          role: 'CLIENT',
        }),
        select: expect.any(Object),
      });
    });
  });

  describe('getUsers', () => {
    it('deve listar todos os usuários', async () => {
      const mockUsers = [
        {
          id: '1',
          email: 'user1@example.com',
          name: 'User 1',
          role: 'CLIENT',
          isActive: true,
          emailVerified: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        {
          id: '2',
          email: 'user2@example.com',
          name: 'User 2',
          role: 'ADMIN',
          isActive: true,
          emailVerified: null,
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
    it('deve buscar usuário por ID', async () => {
      const userId = '1';
      mockRequest.params = { id: userId };

      const mockUser = {
        id: userId,
        email: 'test@example.com',
        name: 'Test User',
        role: 'CLIENT',
        isActive: true,
        emailVerified: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        addresses: [],
        paymentMethods: [],
        orders: [],
      };

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

    it('deve retornar erro se usuário não existe', async () => {
      const userId = 'nonexistent';
      mockRequest.params = { id: userId };

      (prisma.user.findUnique as any).mockResolvedValue(null);

      await getUserById(mockRequest, mockReply);

      expect(mockReply.status).toHaveBeenCalledWith(404);
      expect(mockReply.send).toHaveBeenCalledWith({
        error: 'Usuário não encontrado',
      });
    });
  });

  describe('updateUser', () => {
    it('deve atualizar usuário com sucesso', async () => {
      const userId = '1';
      const updateData = {
        name: 'Updated Name',
        phone: '11888888888',
      };

      mockRequest.params = { id: userId };
      mockRequest.body = updateData;

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

      (prisma.user.findUnique as any).mockResolvedValue(existingUser);
      (prisma.user.update as any).mockResolvedValue(updatedUser);

      await updateUser(mockRequest, mockReply);

      expect(prisma.user.findUnique).toHaveBeenCalledWith({
        where: { id: userId },
      });

      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: userId },
        data: updateData,
        select: expect.any(Object),
      });

      expect(mockReply.send).toHaveBeenCalledWith({
        message: 'Usuário atualizado com sucesso',
        user: updatedUser,
      });
    });

    it('deve retornar erro se usuário não existe', async () => {
      const userId = 'nonexistent';
      mockRequest.params = { id: userId };
      mockRequest.body = { name: 'Updated Name' };

      (prisma.user.findUnique as any).mockResolvedValue(null);

      await updateUser(mockRequest, mockReply);

      expect(mockReply.status).toHaveBeenCalledWith(404);
      expect(mockReply.send).toHaveBeenCalledWith({
        error: 'Usuário não encontrado',
      });
    });

    it('deve retornar erro se email já existe', async () => {
      const userId = '1';
      const updateData = {
        email: 'existing@example.com',
      };

      mockRequest.params = { id: userId };
      mockRequest.body = updateData;

      const existingUser = {
        id: userId,
        email: 'test@example.com',
      };

      (prisma.user.findUnique as any)
        .mockResolvedValueOnce(existingUser)
        .mockResolvedValueOnce({ id: '2', email: updateData.email });

      await updateUser(mockRequest, mockReply);

      expect(mockReply.status).toHaveBeenCalledWith(409);
      expect(mockReply.send).toHaveBeenCalledWith({
        error: 'Email já cadastrado',
      });
    });
  });

  describe('deleteUser', () => {
    it('deve deletar usuário com sucesso', async () => {
      const userId = '1';
      mockRequest.params = { id: userId };

      const existingUser = {
        id: userId,
        email: 'test@example.com',
      };

      (prisma.user.findUnique as any).mockResolvedValue(existingUser);
      (prisma.user.delete as any).mockResolvedValue(existingUser);

      await deleteUser(mockRequest, mockReply);

      expect(prisma.user.findUnique).toHaveBeenCalledWith({
        where: { id: userId },
      });

      expect(prisma.user.delete).toHaveBeenCalledWith({
        where: { id: userId },
      });

      expect(mockReply.send).toHaveBeenCalledWith({
        message: 'Usuário deletado com sucesso',
      });
    });

    it('deve retornar erro se usuário não existe', async () => {
      const userId = 'nonexistent';
      mockRequest.params = { id: userId };

      (prisma.user.findUnique as any).mockResolvedValue(null);

      await deleteUser(mockRequest, mockReply);

      expect(mockReply.status).toHaveBeenCalledWith(404);
      expect(mockReply.send).toHaveBeenCalledWith({
        error: 'Usuário não encontrado',
      });
    });
  });
});

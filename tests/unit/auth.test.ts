import { describe, it, expect, beforeEach, vi } from 'vitest';
import bcrypt from 'bcryptjs';
import { register, login, logout, getMe, refreshToken } from '../../src/controllers/auth.controller.js';
import { prisma } from '../../src/lib/prisma.js';

// Mock do Prisma
vi.mock('../../src/lib/prisma', () => ({
  prisma: {
    user: {
      findUnique: vi.fn(),
      create: vi.fn(),
    },
  },
}));

// Mock do Better Auth
vi.mock('../../src/lib/auth', () => ({
  auth: {
    api: {
      signInEmail: vi.fn(),
      signOut: vi.fn(),
      getSession: vi.fn(),
    },
  },
}));

describe('Auth Controller', () => {
  let mockRequest: any;
  let mockReply: any;

  beforeEach(() => {
    mockRequest = {
      body: {},
      headers: {},
    };

    mockReply = {
      status: vi.fn().mockReturnThis(),
      send: vi.fn().mockReturnThis(),
    };

    vi.clearAllMocks();
  });

  describe('register', () => {
    it('deve registrar um novo usuário com sucesso', async () => {
      const userData = {
        email: 'test@example.com',
        password: 'password123',
        name: 'Test User',
        phone: '11999999999',
      };

      mockRequest.body = userData;

      (prisma.user.findUnique as any).mockResolvedValue(null);
      (prisma.user.create as any).mockResolvedValue({
        id: '1',
        email: userData.email,
        name: userData.name,
        phone: userData.phone,
        role: 'CLIENT',
        isActive: true,
        emailVerified: null,
        createdAt: new Date(),
      });

      await register(mockRequest, mockReply);

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

      await register(mockRequest, mockReply);

      expect(mockReply.status).toHaveBeenCalledWith(400);
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

      await register(mockRequest, mockReply);

      expect(bcryptHashSpy).toHaveBeenCalledWith(userData.password, 10);
    });
  });

  describe('login', () => {
    it('deve fazer login com credenciais válidas', async () => {
      const loginData = {
        email: 'test@example.com',
        password: 'password123',
      };

      mockRequest.body = loginData;

      const hashedPassword = await bcrypt.hash(loginData.password, 10);

      (prisma.user.findUnique as any).mockResolvedValue({
        id: '1',
        email: loginData.email,
        password: hashedPassword,
        name: 'Test User',
        role: 'CLIENT',
        isActive: true,
        emailVerified: null,
      });

      const { auth } = await import('../../src/lib/auth');
      (auth.api.signInEmail as any).mockResolvedValue({
        token: 'test-token',
        expiresAt: new Date(),
      });

      await login(mockRequest, mockReply);

      expect(prisma.user.findUnique).toHaveBeenCalledWith({
        where: { email: loginData.email },
      });

      expect(mockReply.send).toHaveBeenCalledWith({
        message: 'Login realizado com sucesso',
        user: expect.objectContaining({
          email: loginData.email,
        }),
        session: expect.any(Object),
      });
    });

    it('deve retornar erro se usuário não existe', async () => {
      const loginData = {
        email: 'nonexistent@example.com',
        password: 'password123',
      };

      mockRequest.body = loginData;

      (prisma.user.findUnique as any).mockResolvedValue(null);

      await login(mockRequest, mockReply);

      expect(mockReply.status).toHaveBeenCalledWith(401);
      expect(mockReply.send).toHaveBeenCalledWith({
        error: 'Credenciais inválidas',
      });
    });

    it('deve retornar erro se senha está incorreta', async () => {
      const loginData = {
        email: 'test@example.com',
        password: 'wrongpassword',
      };

      mockRequest.body = loginData;

      const hashedPassword = await bcrypt.hash('correctpassword', 10);

      (prisma.user.findUnique as any).mockResolvedValue({
        id: '1',
        email: loginData.email,
        password: hashedPassword,
        name: 'Test User',
        role: 'CLIENT',
        isActive: true,
      });

      await login(mockRequest, mockReply);

      expect(mockReply.status).toHaveBeenCalledWith(401);
      expect(mockReply.send).toHaveBeenCalledWith({
        error: 'Credenciais inválidas',
      });
    });

    it('deve retornar erro se usuário está desativado', async () => {
      const loginData = {
        email: 'test@example.com',
        password: 'password123',
      };

      mockRequest.body = loginData;

      const hashedPassword = await bcrypt.hash(loginData.password, 10);

      (prisma.user.findUnique as any).mockResolvedValue({
        id: '1',
        email: loginData.email,
        password: hashedPassword,
        name: 'Test User',
        role: 'CLIENT',
        isActive: false,
      });

      await login(mockRequest, mockReply);

      expect(mockReply.status).toHaveBeenCalledWith(403);
      expect(mockReply.send).toHaveBeenCalledWith({
        error: 'Usuário desativado',
      });
    });
  });

  describe('logout', () => {
    it('deve fazer logout com sucesso', async () => {
      const { auth } = await import('../../src/lib/auth');
      (auth.api.signOut as any).mockResolvedValue(undefined);

      await logout(mockRequest, mockReply);

      expect(auth.api.signOut).toHaveBeenCalledWith({
        headers: mockRequest.headers,
      });

      expect(mockReply.send).toHaveBeenCalledWith({
        message: 'Logout realizado com sucesso',
      });
    });
  });

  describe('getMe', () => {
    it('deve retornar usuário autenticado', async () => {
      const { auth } = await import('../../src/lib/auth');
      (auth.api.getSession as any).mockResolvedValue({
        user: {
          id: '1',
          email: 'test@example.com',
          name: 'Test User',
          role: 'CLIENT',
        },
      });

      await getMe(mockRequest, mockReply);

      expect(auth.api.getSession).toHaveBeenCalledWith({
        headers: mockRequest.headers,
      });

      expect(mockReply.send).toHaveBeenCalledWith({
        user: expect.objectContaining({
          email: 'test@example.com',
        }),
      });
    });

    it('deve retornar erro se não está autenticado', async () => {
      const { auth } = await import('../../src/lib/auth');
      (auth.api.getSession as any).mockResolvedValue(null);

      await getMe(mockRequest, mockReply);

      expect(mockReply.status).toHaveBeenCalledWith(401);
      expect(mockReply.send).toHaveBeenCalledWith({
        error: 'Não autenticado',
      });
    });
  });

  describe('refreshToken', () => {
    it('deve retornar sessão se válida', async () => {
      const { auth } = await import('../../src/lib/auth');
      (auth.api.getSession as any).mockResolvedValue({
        user: {
          id: '1',
          email: 'test@example.com',
          name: 'Test User',
        },
      });

      await refreshToken(mockRequest, mockReply);

      expect(mockReply.send).toHaveBeenCalledWith({
        session: expect.any(Object),
      });
    });

    it('deve retornar erro se sessão é inválida', async () => {
      const { auth } = await import('../../src/lib/auth');
      (auth.api.getSession as any).mockResolvedValue(null);

      await refreshToken(mockRequest, mockReply);

      expect(mockReply.status).toHaveBeenCalledWith(401);
      expect(mockReply.send).toHaveBeenCalledWith({
        error: 'Sessão inválida ou expirada',
      });
    });
  });
});

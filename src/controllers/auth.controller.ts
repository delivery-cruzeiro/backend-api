import type { FastifyRequest, FastifyReply } from 'fastify';
import bcrypt from 'bcryptjs';
import { prisma } from '../lib/prisma.js';
import { auth } from '../lib/auth.js';

export interface RegisterRequest {
  email: string;
  password: string;
  name: string;
  phone?: string;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export const register = async (request: FastifyRequest<{ Body: RegisterRequest }>, reply: FastifyReply) => {
  try {
    const { email, password, name, phone } = request.body;

    // Verificar se o email já existe
    const existingUser = await prisma.user.findUnique({
      where: { email },
    });

    if (existingUser) {
      return reply.status(400).send({
        error: 'Email já cadastrado',
      });
    }

    // Hash da senha
    const hashedPassword = await bcrypt.hash(password, 10);

    // Criar usuário
    const user = await prisma.user.create({
      data: {
        email,
        password: hashedPassword,
        name,
        phone,
        role: 'CLIENT',
        isActive: true,
        emailVerified: null,
      },
      select: {
        id: true,
        email: true,
        name: true,
        phone: true,
        avatar: true,
        role: true,
        isActive: true,
        emailVerified: true,
        createdAt: true,
      },
    });

    return reply.status(201).send({
      message: 'Usuário criado com sucesso',
      user,
    });
  } catch (error) {
    console.error('Erro ao registrar usuário:', error);
    return reply.status(500).send({
      error: 'Erro interno do servidor',
    });
  }
};

export const login = async (request: FastifyRequest<{ Body: LoginRequest }>, reply: FastifyReply) => {
  try {
    const { email, password } = request.body;

    // Buscar usuário
    const user = await prisma.user.findUnique({
      where: { email },
    });

    if (!user) {
      return reply.status(401).send({
        error: 'Credenciais inválidas',
      });
    }

    if (!user.password) {
      return reply.status(401).send({
        error: 'Credenciais inválidas',
      });
    }

    // Verificar senha
    const isValidPassword = await bcrypt.compare(password, user.password);

    if (!isValidPassword) {
      return reply.status(401).send({
        error: 'Credenciais inválidas',
      });
    }

    // Verificar se usuário está ativo
    if (!user.isActive) {
      return reply.status(403).send({
        error: 'Usuário desativado',
      });
    }

    // Criar sessão com Better Auth
    const session = await auth.api.signInEmail({
      body: {
        email,
        password,
      },
    });

    return reply.send({
      message: 'Login realizado com sucesso',
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        phone: user.phone,
        avatar: user.avatar,
        role: user.role,
        isActive: user.isActive,
        emailVerified: user.emailVerified,
      },
      session,
    });
  } catch (error) {
    console.error('Erro ao fazer login:', error);
    return reply.status(500).send({
      error: 'Erro interno do servidor',
    });
  }
};

export const logout = async (request: FastifyRequest, reply: FastifyReply) => {
  try {
    // Deletar sessão com Better Auth
    await auth.api.signOut({
      headers: request.headers as Record<string, string>,
    });

    return reply.send({
      message: 'Logout realizado com sucesso',
    });
  } catch (error) {
    console.error('Erro ao fazer logout:', error);
    return reply.status(500).send({
      error: 'Erro interno do servidor',
    });
  }
};

export const getMe = async (request: FastifyRequest, reply: FastifyReply) => {
  try {
    // Obter sessão atual com Better Auth
    const session = await auth.api.getSession({
      headers: request.headers as Record<string, string>,
    });

    if (!session) {
      return reply.status(401).send({
        error: 'Não autenticado',
      });
    }

    return reply.send({
      user: session.user,
    });
  } catch (error) {
    console.error('Erro ao obter usuário:', error);
    return reply.status(500).send({
      error: 'Erro interno do servidor',
    });
  }
};

export const refreshToken = async (request: FastifyRequest, reply: FastifyReply) => {
  try {
    // Better Auth gerencia automaticamente o refresh de tokens
    // Apenas verificar se a sessão ainda é válida
    const session = await auth.api.getSession({
      headers: request.headers as Record<string, string>,
    });

    if (!session) {
      return reply.status(401).send({
        error: 'Sessão inválida ou expirada',
      });
    }

    return reply.send({
      session,
    });
  } catch (error) {
    console.error('Erro ao verificar sessão:', error);
    return reply.status(401).send({
      error: 'Sessão inválida ou expirada',
    });
  }
};

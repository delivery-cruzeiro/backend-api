import type { FastifyRequest, FastifyReply } from 'fastify';
import bcrypt from 'bcryptjs';
import { prisma } from '../lib/prisma.js';

export interface CreateUserRequest {
  email: string;
  password: string;
  name: string;
  phone?: string;
  role?: 'CLIENT' | 'ADMIN' | 'MANAGER' | 'SUPER_ADMIN';
}

export const createUser = async (request: FastifyRequest<{ Body: CreateUserRequest }>, reply: FastifyReply) => {
  try {
    const { email, password, name, phone, role = 'CLIENT' } = request.body;

    // Validar campos obrigatórios
    if (!email || !password || !name) {
      return reply.status(400).send({
        error: 'Campos obrigatórios: email, password, name',
      });
    }

    // Validar formato do email
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return reply.status(400).send({
        error: 'Email inválido',
      });
    }

    // Validar tamanho da senha
    if (password.length < 6) {
      return reply.status(400).send({
        error: 'A senha deve ter pelo menos 6 caracteres',
      });
    }

    // Verificar se o email já existe
    const existingUser = await prisma.user.findUnique({
      where: { email },
    });

    if (existingUser) {
      return reply.status(409).send({
        error: 'Email já cadastrado',
      });
    }

    // Hash da senha
    const hashedPassword = await bcrypt.hash(password, 10);

    // Criar usuário no banco de dados
    const user = await prisma.user.create({
      data: {
        email,
        password: hashedPassword,
        name,
        phone,
        role,
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
        updatedAt: true,
      },
    });

    return reply.status(201).send({
      message: 'Usuário criado com sucesso',
      user,
    });
  } catch (error) {
    console.error('Erro ao criar usuário:', error);
    return reply.status(500).send({
      error: 'Erro interno do servidor',
    });
  }
};

export const getUsers = async (_request: FastifyRequest, reply: FastifyReply) => {
  try {
    const users = await prisma.user.findMany({
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
        updatedAt: true,
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    return reply.send({
      users,
      total: users.length,
    });
  } catch (error) {
    console.error('Erro ao buscar usuários:', error);
    return reply.status(500).send({
      error: 'Erro interno do servidor',
    });
  }
};

export const getUserById = async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
  try {
    const { id } = request.params;

    const user = await prisma.user.findUnique({
      where: { id },
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
        updatedAt: true,
        addresses: true,
        paymentMethods: true,
        orders: {
          select: {
            id: true,
            status: true,
            total: true,
            createdAt: true,
          },
          orderBy: {
            createdAt: 'desc',
          },
          take: 10,
        },
      },
    });

    if (!user) {
      return reply.status(404).send({
        error: 'Usuário não encontrado',
      });
    }

    return reply.send({
      user,
    });
  } catch (error) {
    console.error('Erro ao buscar usuário:', error);
    return reply.status(500).send({
      error: 'Erro interno do servidor',
    });
  }
};

export const updateUser = async (
  request: FastifyRequest<{
    Params: { id: string };
    Body: Partial<CreateUserRequest & { isActive: boolean }>;
  }>,
  reply: FastifyReply
) => {
  try {
    const { id } = request.params;
    const { email, name, phone, role, isActive } = request.body;

    // Verificar se o usuário existe
    const existingUser = await prisma.user.findUnique({
      where: { id },
    });

    if (!existingUser) {
      return reply.status(404).send({
        error: 'Usuário não encontrado',
      });
    }

    // Se email foi alterado, verificar se já existe
    if (email && email !== existingUser.email) {
      const emailExists = await prisma.user.findUnique({
        where: { email },
      });

      if (emailExists) {
        return reply.status(409).send({
          error: 'Email já cadastrado',
        });
      }
    }

    // Atualizar usuário
    const user = await prisma.user.update({
      where: { id },
      data: {
        ...(email && { email }),
        ...(name && { name }),
        ...(phone !== undefined && { phone }),
        ...(role && { role }),
        ...(isActive !== undefined && { isActive }),
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
        updatedAt: true,
      },
    });

    return reply.send({
      message: 'Usuário atualizado com sucesso',
      user,
    });
  } catch (error) {
    console.error('Erro ao atualizar usuário:', error);
    return reply.status(500).send({
      error: 'Erro interno do servidor',
    });
  }
};

export const deleteUser = async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
  try {
    const { id } = request.params;

    // Verificar se o usuário existe
    const existingUser = await prisma.user.findUnique({
      where: { id },
    });

    if (!existingUser) {
      return reply.status(404).send({
        error: 'Usuário não encontrado',
      });
    }

    // Deletar usuário (cascade deletará endereços, pedidos, etc.)
    await prisma.user.delete({
      where: { id },
    });

    return reply.send({
      message: 'Usuário deletado com sucesso',
    });
  } catch (error) {
    console.error('Erro ao deletar usuário:', error);
    return reply.status(500).send({
      error: 'Erro interno do servidor',
    });
  }
};

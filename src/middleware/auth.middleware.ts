import type { FastifyRequest, FastifyReply } from 'fastify';
import { auth } from '../lib/auth.js';
import { prisma } from '../lib/prisma.js';

export interface AuthenticatedRequest extends FastifyRequest {
  user?: {
    id: string;
    email: string;
    name: string;
    role: string;
  };
}

export const authenticate = async (request: AuthenticatedRequest, reply: FastifyReply) => {
  try {
    // Verificar sessão com Better Auth
    const session = await auth.api.getSession({
      headers: request.headers as Record<string, string>,
    });

    if (!session) {
      return reply.status(401).send({
        error: 'Não autenticado',
      });
    }

    // Buscar usuário completo do banco de dados para incluir o role
    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
      },
    });

    if (!user) {
      return reply.status(401).send({
        error: 'Usuário não encontrado',
      });
    }

    // Adicionar usuário ao request
    request.user = {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
    };
  } catch (error) {
    console.error('Erro ao autenticar:', error);
    return reply.status(401).send({
      error: 'Não autenticado',
    });
  }
};

export const requireRole = (...roles: string[]) => {
  return async (request: AuthenticatedRequest, reply: FastifyReply) => {
    try {
      // Primeiro autenticar
      await authenticate(request, reply);

      // Verificar se o usuário tem o papel necessário
      if (!request.user || !roles.includes(request.user.role)) {
        return reply.status(403).send({
          error: 'Permissão insuficiente',
        });
      }
    } catch (error) {
      console.error('Erro ao verificar permissão:', error);
      return reply.status(403).send({
        error: 'Permissão insuficiente',
      });
    }
  };
};

export const requireAdmin = requireRole('ADMIN', 'SUPER_ADMIN');
export const requireManager = requireRole('MANAGER', 'ADMIN', 'SUPER_ADMIN');
export const requireSuperAdmin = requireRole('SUPER_ADMIN');

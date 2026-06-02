import type { FastifyReply, FastifyRequest } from 'fastify';
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
		const session = await auth.api.getSession({
			headers: request.headers as Record<string, string>,
		});

		if (!session) {
			return reply.status(401).send({
				error: 'Nao autenticado',
			});
		}

		const user = await prisma.user.findUnique({
			where: { id: session.user.id },
			select: {
				id: true,
				email: true,
				isActive: true,
				name: true,
				role: true,
			},
		});

		if (!user) {
			return reply.status(401).send({
				error: 'Usuario nao encontrado',
			});
		}

		if (!user.isActive) {
			return reply.status(403).send({
				error: 'Usuario desativado',
			});
		}

		request.user = {
			id: user.id,
			email: user.email,
			name: user.name,
			role: user.role,
		};
	} catch (error) {
		console.error('Erro ao autenticar:', error);
		return reply.status(401).send({
			error: 'Nao autenticado',
		});
	}
};

export const requireRole = (...roles: string[]) => {
	return async (request: AuthenticatedRequest, reply: FastifyReply) => {
		try {
			await authenticate(request, reply);

			if (reply.sent) {
				return;
			}

			if (!request.user || !roles.includes(request.user.role)) {
				return reply.status(403).send({
					error: 'Permissao insuficiente',
				});
			}
		} catch (error) {
			console.error('Erro ao verificar permissao:', error);
			return reply.status(403).send({
				error: 'Permissao insuficiente',
			});
		}
	};
};

export const requireAdmin = requireRole('ADMIN', 'SUPER_ADMIN');
export const requireManager = requireRole('MANAGER', 'ADMIN', 'SUPER_ADMIN');
export const requireSuperAdmin = requireRole('SUPER_ADMIN');

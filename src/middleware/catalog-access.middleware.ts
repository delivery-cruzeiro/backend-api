import { UserRole, hasRole } from '@delivery-cruzeiro/types';
import type { FastifyReply } from 'fastify';
import { requireAdmin, type AuthenticatedRequest } from './auth.middleware.js';
import type { MultipartRequest } from '../controllers/catalog-request.utils.js';

// Level 2 can submit only status fields. Level 3+ can edit the full record.
export function requireCatalogUpdate(...statusFields: string[]) {
	return async (request: AuthenticatedRequest, reply: FastifyReply) => {
		await requireAdmin(request, reply);
		if (reply.sent || hasRole(request.user?.role, UserRole.MANAGER)) return;

		const multipart = request as unknown as MultipartRequest;
		let fields = request.body;
		if (multipart.isMultipart()) {
			const input: Record<string, unknown> = {};
			for await (const part of multipart.parts()) {
				if (part.type === 'file') {
					await part.toBuffer();
					return reply
						.status(403)
						.send({ error: 'Permissao insuficiente para editar o cadastro' });
				}
				if (!statusFields.includes(part.fieldname) || part.fieldname in input) {
					return reply
						.status(403)
						.send({ error: 'Permissao insuficiente para editar o cadastro' });
				}
				input[part.fieldname] = part.value;
			}
			fields = input;
			request.body = input;
			multipart.isMultipart = () => false;
		}

		if (
			!fields ||
			typeof fields !== 'object' ||
			Array.isArray(fields) ||
			Object.keys(fields).length === 0 ||
			Object.keys(fields).some(field => !statusFields.includes(field))
		) {
			return reply
				.status(403)
				.send({ error: 'Permissao insuficiente para editar o cadastro' });
		}
	};
}

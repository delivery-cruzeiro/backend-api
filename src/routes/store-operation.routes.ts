import type { FastifyInstance } from 'fastify';
import { storeOperationSettingsSchema } from '@delivery-cruzeiro/types';
import { prisma } from '../lib/prisma.js';
import { requireManager } from '../middleware/auth.middleware.js';
import { StoreOperationService } from '../services/store-operation.service.js';

export async function storeOperationRoutes(app: FastifyInstance) {
	const service = new StoreOperationService();
	const params = {
		type: 'object',
		required: ['id'],
		properties: { id: { type: 'string', format: 'uuid' } },
	} as const;
	app.get<{ Params: { id: string } }>(
		'/stores/:id/operation',
		{ schema: { params } },
		async (request, reply) => {
			if (
				!(await prisma.store.findFirst({
					where: { id: request.params.id, isActive: true },
					select: { id: true },
				}))
			)
				return reply.code(404).send({ error: 'Loja não encontrada' });
			return service.availability(request.params.id);
		}
	);
	app.put<{ Params: { id: string } }>(
		'/stores/:id/operation',
		{ preHandler: requireManager, schema: { params } },
		async (request, reply) => {
			const parsed = storeOperationSettingsSchema.safeParse(request.body);
			if (!parsed.success)
				return reply
					.code(400)
					.send({ error: parsed.error.issues.map(issue => issue.message).join(' ') });
			if (
				!(await prisma.store.findFirst({
					where: { id: request.params.id, isActive: true },
					select: { id: true },
				}))
			)
				return reply.code(404).send({ error: 'Loja não encontrada' });
			await prisma.storeOperationSettings.upsert({
				where: { storeId: request.params.id },
				create: { storeId: request.params.id, settings: parsed.data },
				update: { settings: parsed.data },
			});
			return service.availability(request.params.id);
		}
	);
}

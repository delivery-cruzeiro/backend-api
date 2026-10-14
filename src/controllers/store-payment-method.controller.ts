import {
	createStorePaymentMethodSchema,
	formatZodError,
	updateStorePaymentMethodSchema,
} from '@delivery-cruzeiro/types';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { prisma } from '../lib/prisma.js';
import type { AuthenticatedRequest } from '../middleware/auth.middleware.js';

const select = {
	id: true,
	storeId: true,
	name: true,
	type: true,
	fields: true,
	isActive: true,
	createdAt: true,
	updatedAt: true,
} as const;

async function ensureStoreAccess(request: AuthenticatedRequest, storeId: string) {
	return prisma.store.findFirst({
		where: {
			id: storeId,
			...(request.user?.role !== 'SUPER_ADMIN' && { users: { some: { id: request.user?.id } } }),
		},
		select: { id: true },
	});
}

function validationError(reply: FastifyReply, error: Parameters<typeof formatZodError>[0]) {
	const formatted = formatZodError(error);
	return reply.status(formatted.statusCode ?? 400).send({
		code: formatted.code,
		details: formatted.details,
		error: formatted.message,
	});
}

function isUniqueConstraintError(error: unknown) {
	return Boolean(error && typeof error === 'object' && 'code' in error && error.code === 'P2002');
}

export async function listStorePaymentMethods(
	request: FastifyRequest<{ Querystring: { storeId?: string } }> & AuthenticatedRequest,
	reply: FastifyReply
) {
	const storeId = request.query.storeId?.trim();
	if (!storeId) return reply.status(400).send({ error: 'storeId e obrigatorio' });
	if (!(await ensureStoreAccess(request, storeId))) {
		return reply.status(404).send({ error: 'Loja nao encontrada ou sem permissao' });
	}
	const paymentMethods = await prisma.storePaymentMethod.findMany({
		where: { storeId },
		orderBy: [{ isActive: 'desc' }, { name: 'asc' }],
		select,
	});
	return reply.send({ paymentMethods, total: paymentMethods.length });
}

export async function listActiveStorePaymentMethods(
	request: FastifyRequest<{ Querystring: { storeId?: string } }>,
	reply: FastifyReply
) {
	const storeId = request.query.storeId?.trim();
	if (!storeId) return reply.status(400).send({ error: 'storeId e obrigatorio' });
	const paymentMethods = await prisma.storePaymentMethod.findMany({
		where: { storeId, isActive: true, store: { isActive: true } },
		orderBy: { name: 'asc' },
		select,
	});
	return reply.send({ paymentMethods, total: paymentMethods.length });
}

export async function createStorePaymentMethod(request: FastifyRequest & AuthenticatedRequest, reply: FastifyReply) {
	const validation = createStorePaymentMethodSchema.safeParse(request.body ?? {});
	if (!validation.success) return validationError(reply, validation.error);
	if (!(await ensureStoreAccess(request, validation.data.storeId))) {
		return reply.status(404).send({ error: 'Loja nao encontrada ou sem permissao' });
	}
	try {
		const paymentMethod = await prisma.storePaymentMethod.create({ data: validation.data, select });
		return reply.status(201).send({ message: 'Forma de pagamento criada com sucesso', paymentMethod });
	} catch (error) {
		if (isUniqueConstraintError(error)) return reply.status(409).send({ error: 'Ja existe uma forma de pagamento com este nome na loja' });
		throw error;
	}
}

export async function updateStorePaymentMethod(
	request: FastifyRequest<{ Params: { id: string } }> & AuthenticatedRequest,
	reply: FastifyReply
) {
	const validation = updateStorePaymentMethodSchema.safeParse(request.body ?? {});
	if (!validation.success) return validationError(reply, validation.error);
	const existing = await prisma.storePaymentMethod.findUnique({ where: { id: request.params.id }, select: { storeId: true } });
	if (!existing || !(await ensureStoreAccess(request, existing.storeId))) {
		return reply.status(404).send({ error: 'Forma de pagamento nao encontrada' });
	}
	try {
		const paymentMethod = await prisma.storePaymentMethod.update({ where: { id: request.params.id }, data: validation.data, select });
		return reply.send({ message: 'Forma de pagamento atualizada com sucesso', paymentMethod });
	} catch (error) {
		if (isUniqueConstraintError(error)) return reply.status(409).send({ error: 'Ja existe uma forma de pagamento com este nome na loja' });
		throw error;
	}
}

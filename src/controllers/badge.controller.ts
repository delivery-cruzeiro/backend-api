import {
	createBadgeSchema,
	formatZodError,
	setBadgeProductsSchema,
	updateBadgeSchema,
} from '@delivery-cruzeiro/types';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { prisma } from '../lib/prisma.js';
import type { AuthenticatedRequest } from '../middleware/auth.middleware.js';

const badgeSelect = {
	id: true,
	name: true,
	isActive: true,
	color: true,
	icon: true,
	storeId: true,
	createdAt: true,
	updatedAt: true,
	products: {
		select: { productId: true },
		orderBy: { createdAt: 'asc' as const },
	},
} as const;

function serializeBadge(badge: {
	products: Array<{ productId: string }>;
	[key: string]: unknown;
}) {
	const { products, ...data } = badge;
	return { ...data, productIds: products.map(product => product.productId) };
}

function sendValidationError(
	reply: FastifyReply,
	validationError: Parameters<typeof formatZodError>[0]
) {
	const error = formatZodError(validationError);
	return reply.status(error.statusCode ?? 400).send({
		code: error.code,
		details: error.details,
		error: error.message,
	});
}

async function ensureStoreAccess(userId: string, role: string, storeId: string) {
	const store = await prisma.store.findFirst({
		where: {
			id: storeId,
			...(role !== 'SUPER_ADMIN' && { users: { some: { id: userId } } }),
		},
		select: { id: true },
	});

	if (!store) {
		throw new Error('Loja nao encontrada ou sem permissao');
	}
}

function isUniqueConstraintError(error: unknown) {
	return Boolean(
		error &&
			typeof error === 'object' &&
			'code' in error &&
			(error as { code?: string }).code === 'P2002'
	);
}

export async function listBadges(
	request: FastifyRequest<{ Querystring: { storeId?: string } }>,
	reply: FastifyReply
) {
	try {
		const storeId = request.query.storeId?.trim();

		if (!storeId) {
			return reply.status(400).send({ error: 'storeId e obrigatorio' });
		}

		const user = (request as AuthenticatedRequest).user!;
		await ensureStoreAccess(user.id, user.role, storeId);
		const badges = await prisma.badge.findMany({
			where: { storeId },
			select: badgeSelect,
			orderBy: [{ isActive: 'desc' }, { name: 'asc' }],
		});

		return reply.send({
			badges: badges.map(serializeBadge),
			total: badges.length,
		});
	} catch (error) {
		console.error('Erro ao listar badges:', error);
		const message = error instanceof Error ? error.message : 'Erro interno do servidor';
		return reply.status(message.includes('permissao') ? 404 : 500).send({ error: message });
	}
}

export async function getBadge(
	request: FastifyRequest<{ Params: { id: string } }>,
	reply: FastifyReply
) {
	try {
		const badge = await prisma.badge.findUnique({
			where: { id: request.params.id },
			select: badgeSelect,
		});

		if (!badge) {
			return reply.status(404).send({ error: 'Badge nao encontrada' });
		}

		const user = (request as AuthenticatedRequest).user!;
		await ensureStoreAccess(user.id, user.role, badge.storeId);
		return reply.send({ badge: serializeBadge(badge) });
	} catch (error) {
		console.error('Erro ao buscar badge:', error);
		const message = error instanceof Error ? error.message : 'Erro interno do servidor';
		return reply.status(message.includes('permissao') ? 404 : 500).send({ error: message });
	}
}

export async function createBadge(request: FastifyRequest, reply: FastifyReply) {
	try {
		const validation = createBadgeSchema.safeParse(request.body);

		if (!validation.success) {
			return sendValidationError(reply, validation.error);
		}

		const user = (request as AuthenticatedRequest).user!;
		await ensureStoreAccess(user.id, user.role, validation.data.storeId);
		const badge = await prisma.badge.create({
			data: {
				color: validation.data.color.toUpperCase(),
				icon: validation.data.icon || null,
				isActive: validation.data.isActive,
				name: validation.data.name,
				storeId: validation.data.storeId,
			},
			select: badgeSelect,
		});

		return reply.status(201).send({
			badge: serializeBadge(badge),
			message: 'Badge criada com sucesso',
		});
	} catch (error) {
		console.error('Erro ao criar badge:', error);
		if (isUniqueConstraintError(error)) {
			return reply.status(409).send({ error: 'Ja existe uma badge com este nome na loja' });
		}
		const message = error instanceof Error ? error.message : 'Erro interno do servidor';
		return reply.status(message.includes('permissao') ? 404 : 500).send({ error: message });
	}
}

export async function updateBadge(
	request: FastifyRequest<{ Params: { id: string } }>,
	reply: FastifyReply
) {
	try {
		const validation = updateBadgeSchema.safeParse(request.body);

		if (!validation.success) {
			return sendValidationError(reply, validation.error);
		}

		const existing = await prisma.badge.findUnique({
			where: { id: request.params.id },
			select: { storeId: true },
		});

		if (!existing) {
			return reply.status(404).send({ error: 'Badge nao encontrada' });
		}

		const user = (request as AuthenticatedRequest).user!;
		await ensureStoreAccess(user.id, user.role, existing.storeId);
		const badge = await prisma.badge.update({
			where: { id: request.params.id },
			data: {
				...validation.data,
				...(validation.data.color && {
					color: validation.data.color.toUpperCase(),
				}),
				...(validation.data.icon !== undefined && {
					icon: validation.data.icon || null,
				}),
			},
			select: badgeSelect,
		});

		return reply.send({
			badge: serializeBadge(badge),
			message: 'Badge atualizada com sucesso',
		});
	} catch (error) {
		console.error('Erro ao atualizar badge:', error);
		if (isUniqueConstraintError(error)) {
			return reply.status(409).send({ error: 'Ja existe uma badge com este nome na loja' });
		}
		const message = error instanceof Error ? error.message : 'Erro interno do servidor';
		return reply.status(message.includes('permissao') ? 404 : 500).send({ error: message });
	}
}

export async function setBadgeProducts(
	request: FastifyRequest<{ Params: { id: string } }>,
	reply: FastifyReply
) {
	try {
		const validation = setBadgeProductsSchema.safeParse(request.body);

		if (!validation.success) {
			return sendValidationError(reply, validation.error);
		}

		const badge = await prisma.badge.findUnique({
			where: { id: request.params.id },
			select: { id: true, storeId: true },
		});

		if (!badge) {
			return reply.status(404).send({ error: 'Badge nao encontrada' });
		}

		const user = (request as AuthenticatedRequest).user!;
		await ensureStoreAccess(user.id, user.role, badge.storeId);
		const productIds = [...new Set(validation.data.productIds)];
		const productCount = await prisma.product.count({
			where: {
				id: { in: productIds },
				stores: { some: { id: badge.storeId } },
			},
		});

		if (productCount !== productIds.length) {
			return reply.status(400).send({
				error: 'Um ou mais produtos nao pertencem a loja da badge',
			});
		}

		await prisma.$transaction(async transaction => {
			await transaction.productBadge.deleteMany({ where: { badgeId: badge.id } });

			if (productIds.length > 0) {
				await transaction.productBadge.createMany({
					data: productIds.map(productId => ({ badgeId: badge.id, productId })),
				});
			}
		});

		return reply.send({
			message: 'Produtos da badge atualizados com sucesso',
			productIds,
		});
	} catch (error) {
		console.error('Erro ao vincular produtos a badge:', error);
		const message = error instanceof Error ? error.message : 'Erro interno do servidor';
		return reply.status(message.includes('permissao') ? 404 : 500).send({ error: message });
	}
}

export async function deleteBadge(
	request: FastifyRequest<{ Params: { id: string } }>,
	reply: FastifyReply
) {
	try {
		const badge = await prisma.badge.findUnique({
			where: { id: request.params.id },
			select: { storeId: true },
		});

		if (!badge) {
			return reply.status(404).send({ error: 'Badge nao encontrada' });
		}

		const user = (request as AuthenticatedRequest).user!;
		await ensureStoreAccess(user.id, user.role, badge.storeId);
		await prisma.badge.delete({ where: { id: request.params.id } });
		return reply.send({ message: 'Badge deletada com sucesso' });
	} catch (error) {
		console.error('Erro ao deletar badge:', error);
		const message = error instanceof Error ? error.message : 'Erro interno do servidor';
		return reply.status(message.includes('permissao') ? 404 : 500).send({ error: message });
	}
}

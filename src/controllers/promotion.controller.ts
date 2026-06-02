import {
	PromotionType,
	createPromotionSchema,
	formatZodError,
	type PromotionDTO,
} from '@delivery-cruzeiro/types';
import type { Prisma } from '@prisma/client';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { prisma } from '../lib/prisma.js';
import {
	buildStoreConnect,
	buildStoreFilter,
	buildStoreSet,
	ensureActiveStoresExist,
	getStoreIdQuery,
	getStoreValidationStatus,
	storeSummaryListArgs,
} from '../services/catalog-store.utils.js';

const promotionSelect = {
	id: true,
	name: true,
	description: true,
	type: true,
	value: true,
	minPurchase: true,
	maxDiscount: true,
	startDate: true,
	endDate: true,
	isActive: true,
	stores: storeSummaryListArgs,
	products: {
		select: {
			productId: true,
			role: true,
			product: {
				select: {
					id: true,
					name: true,
				},
			},
		},
	},
	createdAt: true,
	updatedAt: true,
} satisfies Prisma.PromotionSelect;

type PromotionWithProducts = Prisma.PromotionGetPayload<{
	select: typeof promotionSelect;
}>;

function serializePromotion(promotion: PromotionWithProducts) {
	return {
		...promotion,
		maxDiscount: promotion.maxDiscount === null ? null : Number(promotion.maxDiscount),
		minPurchase: promotion.minPurchase === null ? null : Number(promotion.minPurchase),
		value: Number(promotion.value),
	};
}

async function ensureProductsExist(productIds: string[]) {
	const uniqueProductIds = [...new Set(productIds)];
	const products = await prisma.product.findMany({
		where: {
			id: {
				in: uniqueProductIds,
			},
		},
		select: {
			id: true,
		},
	});

	return products.length === uniqueProductIds.length;
}

function buildPromotionProductData(data: PromotionDTO) {
	if (data.type === PromotionType.BUY_X_GET_Y) {
		return [
			{
				productId: data.buyProductId as string,
				role: 'TARGET' as const,
			},
			{
				productId: data.rewardProductId as string,
				role: 'REWARD' as const,
			},
		];
	}

	return (data.productIds ?? []).map(productId => ({
		productId,
		role: 'TARGET' as const,
	}));
}

export const getPromotions = async (
	request: FastifyRequest<{ Querystring: { storeId?: string } }>,
	reply: FastifyReply
) => {
	try {
		const storeId = getStoreIdQuery(request.query);
		const promotions = await prisma.promotion.findMany({
			where: buildStoreFilter(storeId),
			orderBy: [{ startDate: 'desc' }, { name: 'asc' }],
			select: promotionSelect,
		});

		return reply.send({
			promotions: promotions.map(promotion => serializePromotion(promotion)),
			total: promotions.length,
		});
	} catch (error) {
		console.error('Erro ao listar promocoes:', error);
		return reply.status(500).send({
			error: 'Erro interno do servidor',
		});
	}
};

export const createPromotion = async (
	request: FastifyRequest<{ Body: PromotionDTO }>,
	reply: FastifyReply
) => {
	try {
		const validation = createPromotionSchema.safeParse(request.body ?? {});

		if (!validation.success) {
			const error = formatZodError(validation.error);

			return reply.status(error.statusCode ?? 400).send({
				error: error.message,
				code: error.code,
				details: error.details,
			});
		}

		const promotionProductData = buildPromotionProductData(validation.data);

		try {
			await ensureActiveStoresExist(validation.data.storeIds);
		} catch (storeError) {
			const message =
				storeError instanceof Error ? storeError.message : 'Erro interno do servidor';

			return reply.status(getStoreValidationStatus(message)).send({ error: message });
		}

		if (
			promotionProductData.length > 0 &&
			!(await ensureProductsExist(promotionProductData.map(product => product.productId)))
		) {
			return reply.status(404).send({
				error: 'Produto nao encontrado',
			});
		}

		const promotion = await prisma.promotion.create({
			data: {
				description: validation.data.description,
				endDate: validation.data.endDate,
				isActive: validation.data.isActive ?? true,
				maxDiscount: validation.data.maxDiscount,
				minPurchase: validation.data.minPurchase,
				name: validation.data.name,
				startDate: validation.data.startDate,
				type: validation.data.type,
				value: validation.data.value,
				stores: buildStoreConnect(validation.data.storeIds),
				products:
					promotionProductData.length > 0
						? {
								create: promotionProductData,
							}
						: undefined,
			},
			select: promotionSelect,
		});

		return reply.status(201).send({
			message: 'Promocao criada com sucesso',
			promotion: serializePromotion(promotion),
		});
	} catch (error) {
		console.error('Erro ao criar promocao:', error);
		return reply.status(500).send({
			error: 'Erro interno do servidor',
		});
	}
};

export const updatePromotion = async (
	request: FastifyRequest<{ Body: PromotionDTO; Params: { id: string } }>,
	reply: FastifyReply
) => {
	try {
		const validation = createPromotionSchema.safeParse(request.body ?? {});

		if (!validation.success) {
			const error = formatZodError(validation.error);

			return reply.status(error.statusCode ?? 400).send({
				error: error.message,
				code: error.code,
				details: error.details,
			});
		}

		const currentPromotion = await prisma.promotion.findUnique({
			where: {
				id: request.params.id,
			},
			select: {
				id: true,
			},
		});

		if (!currentPromotion) {
			return reply.status(404).send({
				error: 'Promocao nao encontrada',
			});
		}

		const promotionProductData = buildPromotionProductData(validation.data);

		try {
			await ensureActiveStoresExist(validation.data.storeIds);
		} catch (storeError) {
			const message =
				storeError instanceof Error ? storeError.message : 'Erro interno do servidor';

			return reply.status(getStoreValidationStatus(message)).send({ error: message });
		}

		if (
			promotionProductData.length > 0 &&
			!(await ensureProductsExist(promotionProductData.map(product => product.productId)))
		) {
			return reply.status(404).send({
				error: 'Produto nao encontrado',
			});
		}

		const promotion = await prisma.promotion.update({
			where: {
				id: request.params.id,
			},
			data: {
				description: validation.data.description,
				endDate: validation.data.endDate,
				isActive: validation.data.isActive ?? true,
				maxDiscount: validation.data.maxDiscount,
				minPurchase: validation.data.minPurchase,
				name: validation.data.name,
				startDate: validation.data.startDate,
				type: validation.data.type,
				value: validation.data.value,
				stores: buildStoreSet(validation.data.storeIds),
				products: {
					deleteMany: {},
					create: promotionProductData,
				},
			},
			select: promotionSelect,
		});

		return reply.send({
			message: 'Promocao atualizada com sucesso',
			promotion: serializePromotion(promotion),
		});
	} catch (error) {
		console.error('Erro ao atualizar promocao:', error);
		return reply.status(500).send({
			error: 'Erro interno do servidor',
		});
	}
};

export const deletePromotion = async (
	request: FastifyRequest<{ Params: { id: string } }>,
	reply: FastifyReply
) => {
	try {
		const promotion = await prisma.promotion.findUnique({
			where: {
				id: request.params.id,
			},
			select: {
				id: true,
			},
		});

		if (!promotion) {
			return reply.status(404).send({
				error: 'Promocao nao encontrada',
			});
		}

		await prisma.promotion.delete({
			where: {
				id: request.params.id,
			},
		});

		return reply.send({
			message: 'Promocao deletada com sucesso',
		});
	} catch (error) {
		console.error('Erro ao deletar promocao:', error);
		return reply.status(500).send({
			error: 'Erro interno do servidor',
		});
	}
};

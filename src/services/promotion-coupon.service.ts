import {
	PromotionEligibilityType,
	PromotionType,
	PromotionUsageMode,
} from '@delivery-cruzeiro/types';
import type { Prisma, PrismaClient } from '@prisma/client';
import { prisma } from '../lib/prisma.js';

const couponPromotionSelect = {
	id: true,
	name: true,
	description: true,
	type: true,
	value: true,
	minPurchase: true,
	maxDiscount: true,
	startDate: true,
	endDate: true,
	eligibilityType: true,
	eligibilityTarget: true,
	usageMode: true,
	usageLimit: true,
	isActive: true,
	stores: {
		select: {
			id: true,
			name: true,
			nickname: true,
			isActive: true,
		},
	},
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

type CouponPromotion = Prisma.PromotionGetPayload<{
	select: typeof couponPromotionSelect;
}>;

type CouponValidationResult =
	| {
			discount: number;
			message: string;
			promotion: ReturnType<typeof serializeCouponPromotion>;
			success: true;
			subtotalAfterDiscount: number;
	  }
	| {
			error: string;
			statusCode: 400 | 403 | 404 | 409;
			success: false;
	  };

function serializeCouponPromotion(promotion: CouponPromotion) {
	return {
		...promotion,
		maxDiscount: promotion.maxDiscount === null ? null : Number(promotion.maxDiscount),
		minPurchase: promotion.minPurchase === null ? null : Number(promotion.minPurchase),
		value: Number(promotion.value),
	};
}

function getEligibilityTargetIds(target: Prisma.JsonValue | null): string[] {
	if (Array.isArray(target)) {
		return target.filter((item): item is string => typeof item === 'string');
	}

	return typeof target === 'string' ? [target] : [];
}

function roundMoney(value: number) {
	return Math.max(0, Math.round(value * 100) / 100);
}

export class PromotionCouponService {
	constructor(private readonly database: PrismaClient = prisma) {}

	async deactivateExpiredPeriodPromotions() {
		try {
			const today = new Date(); today.setUTCHours(0,0,0,0);
			await this.database.promotion.updateMany({where:{usageMode:'AVAILABLE_PERIOD',isActive:true,endDate:{lt:today}},data:{isActive:false}});
		} catch (error) {
			console.warn('Nao foi possivel desativar promocoes vencidas via banco:', error);
		}
	}

	async validateCouponForUser(input: {
		code?: string;
		promotionId?: string | null;
		storeId: string;
		subtotal: number;
		userId: string;
	}): Promise<CouponValidationResult> {
		await this.deactivateExpiredPeriodPromotions();

		const code = input.code?.trim();
		const promotion = await this.database.promotion.findFirst({
			where: {
				...(input.promotionId
					? { id: input.promotionId }
					: code
						? { name: { equals: code, mode: 'insensitive' } }
						: { id: '__missing_coupon__' }),
				isActive: true,
				stores: {
					some: {
						id: input.storeId,
						isActive: true,
					},
				},
			},
			select: couponPromotionSelect,
		});

		if (!promotion) {
			return {
				error: 'Cupom nao encontrado ou inativo para a loja selecionada',
				statusCode: 404,
				success: false,
			};
		}

		if (
			promotion.type !== PromotionType.PERCENTAGE &&
			promotion.type !== PromotionType.FIXED_AMOUNT
		) {
			return {
				error: 'Cupom indisponivel para desconto direto no pedido',
				statusCode: 400,
				success: false,
			};
		}

		const now = new Date();

		if (promotion.startDate > now) {
			return {
				error: 'Cupom ainda nao esta disponivel',
				statusCode: 409,
				success: false,
			};
		}

		if (promotion.usageMode === PromotionUsageMode.AVAILABLE_PERIOD && promotion.endDate < now) {
			await this.database.promotion.update({
				where: { id: promotion.id },
				data: { isActive: false },
			});

			return {
				error: 'Cupom expirado',
				statusCode: 409,
				success: false,
			};
		}

		if (
			promotion.usageMode === PromotionUsageMode.USAGE_QUANTITY &&
			(promotion.usageLimit ?? 0) <= 0
		) {
			await this.database.promotion.update({
				where: { id: promotion.id },
				data: { isActive: false },
			});

			return {
				error: 'Cupom sem usos disponiveis',
				statusCode: 409,
				success: false,
			};
		}

		if (promotion.minPurchase !== null && input.subtotal < Number(promotion.minPurchase)) {
			return {
				error: 'Valor minimo do pedido nao atingido para este cupom',
				statusCode: 400,
				success: false,
			};
		}

		const eligibility = await this.isEligibleForPromotion(promotion, input.userId);

		if (!eligibility) {
			return {
				error: 'Usuario nao elegivel para este cupom',
				statusCode: 403,
				success: false,
			};
		}

		const discount = this.calculateDiscount(promotion, input.subtotal);

		if (discount <= 0) {
			return {
				error: 'Cupom sem desconto aplicavel ao pedido',
				statusCode: 400,
				success: false,
			};
		}

		return {
			discount,
			message: 'Cupom aplicado com sucesso',
			promotion: serializeCouponPromotion(promotion),
			success: true,
			subtotalAfterDiscount: roundMoney(input.subtotal - discount),
		};
	}

	async consumeCouponUsage(promotionId: string | null | undefined) {
		if (!promotionId) {
			return;
		}

		const promotion = await this.database.promotion.findUnique({
			where: { id: promotionId },
			select: {
				id: true,
				usageLimit: true,
				usageMode: true,
			},
		});

		if (!promotion || promotion.usageMode !== PromotionUsageMode.USAGE_QUANTITY) {
			return;
		}

		const currentUsageLimit = promotion.usageLimit ?? 0;
		const nextUsageLimit = Math.max(0, currentUsageLimit - 1);

		await this.database.promotion.update({
			where: { id: promotion.id },
			data: {
				isActive: nextUsageLimit > 0,
				usageLimit: nextUsageLimit,
			},
		});
	}

	private calculateDiscount(promotion: CouponPromotion, subtotal: number) {
		const rawDiscount =
			promotion.type === PromotionType.PERCENTAGE
				? subtotal * (Number(promotion.value) / 100)
				: Number(promotion.value);
		const cappedDiscount =
			promotion.maxDiscount !== null
				? Math.min(rawDiscount, Number(promotion.maxDiscount))
				: rawDiscount;

		return roundMoney(Math.min(cappedDiscount, subtotal));
	}

	private async isEligibleForPromotion(promotion: CouponPromotion, userId: string) {
		if (promotion.eligibilityType === PromotionEligibilityType.ALL) {
			return true;
		}

		const targetIds = getEligibilityTargetIds(promotion.eligibilityTarget);

		if (promotion.eligibilityType === PromotionEligibilityType.SINGLE_USER) {
			return targetIds[0] === userId;
		}

		if (promotion.eligibilityType === PromotionEligibilityType.GROUP) {
			if (targetIds.length === 0) {
				return false;
			}

			const membership = await this.database.userGroupMember.findFirst({
				where: {
					groupId: {
						in: targetIds,
					},
					userId,
				},
				select: {
					id: true,
				},
			});

			return Boolean(membership);
		}

		return false;
	}
}

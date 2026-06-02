import type { FastifyInstance, RouteHandlerMethod } from 'fastify';
import {
	createPromotion,
	deletePromotion,
	getPromotions,
	updatePromotion,
} from '../controllers/promotion.controller.js';
import { requireManager } from '../middleware/auth.middleware.js';

const createPromotionHandler = createPromotion as unknown as RouteHandlerMethod;
const deletePromotionHandler = deletePromotion as unknown as RouteHandlerMethod;
const getPromotionsHandler = getPromotions as unknown as RouteHandlerMethod;
const updatePromotionHandler = updatePromotion as unknown as RouteHandlerMethod;

export async function promotionRoutes(fastify: FastifyInstance) {
	fastify.get(
		'/promotions',
		{
			preHandler: requireManager,
		},
		getPromotionsHandler
	);

	fastify.post(
		'/promotions',
		{
			preHandler: requireManager,
			schema: {
				description: 'Criar promocao',
				tags: ['Promocoes'],
				body: {
					type: 'object',
					required: ['name', 'type', 'value', 'startDate', 'endDate', 'storeIds'],
					properties: {
						name: { type: 'string' },
						description: { type: 'string', nullable: true },
						type: { type: 'string' },
						value: { type: 'number', minimum: 0 },
						minPurchase: { type: 'number', minimum: 0, nullable: true },
						maxDiscount: { type: 'number', minimum: 0, nullable: true },
						startDate: { type: 'string' },
						endDate: { type: 'string' },
						isActive: { type: 'boolean' },
						buyProductId: { type: 'string' },
						rewardProductId: { type: 'string' },
						productIds: {
							type: 'array',
							items: {
								type: 'string',
							},
						},
						storeIds: {
							type: 'array',
							items: {
								type: 'string',
							},
						},
					},
				},
				response: {
					201: {
						type: 'object',
						properties: {
							message: { type: 'string' },
						},
					},
					400: {
						type: 'object',
						properties: {
							error: { type: 'string' },
						},
					},
					404: {
						type: 'object',
						properties: {
							error: { type: 'string' },
						},
					},
				},
			},
		},
		createPromotionHandler
	);

	fastify.put(
		'/promotions/:id',
		{
			preHandler: requireManager,
		},
		updatePromotionHandler
	);

	fastify.delete(
		'/promotions/:id',
		{
			preHandler: requireManager,
		},
		deletePromotionHandler
	);
}

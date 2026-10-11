import Fastify from 'fastify';
import { describe, expect, it } from 'vitest';
import { promotionBodySchema } from '../../src/routes/promotion.routes.js';

const validPayload = {
	description: 'TESTE1',
	eligibilityTarget: null,
	eligibilityType: 'ALL',
	endDate: '2026-09-30T21:42:00.000Z',
	isActive: true,
	maxDiscount: 20,
	minPurchase: 10,
	name: 'TESTE1',
	startDate: '2026-09-08T21:42:00.000Z',
	storeIds: ['fe8215f0-e578-4cca-a9b4-4d8c7fd7f473'],
	type: 'PERCENTAGE',
	usageLimit: 20,
	usageMode: 'USAGE_QUANTITY',
	value: 10,
};

describe('promotion request schema', () => {
	it('accepts the eligibility and usage fields sent by the admin form', async () => {
		const app = Fastify({ ajv: { customOptions: { removeAdditional: false } } });
		app.post('/promotions', { schema: { body: promotionBodySchema } }, async request =>
			request.body
		);

		const response = await app.inject({
			method: 'POST',
			payload: validPayload,
			url: '/promotions',
		});

		expect(response.statusCode).toBe(200);
		expect(response.json()).toMatchObject({
			eligibilityTarget: null,
			eligibilityType: 'ALL',
			usageLimit: 20,
			usageMode: 'USAGE_QUANTITY',
		});
		await app.close();
	});
});

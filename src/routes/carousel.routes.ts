import type { FastifyInstance, RouteHandlerMethod } from 'fastify';
import {
	activateCarousel,
	createCarousel,
	deleteCarousel,
	getActiveCarousel,
	getCarousel,
	listCarousels,
	updateCarousel,
} from '../controllers/carousel.controller.js';
import { requireManager } from '../middleware/auth.middleware.js';

const createCarouselHandler = createCarousel as unknown as RouteHandlerMethod;
const updateCarouselHandler = updateCarousel as unknown as RouteHandlerMethod;
const activateCarouselHandler = activateCarousel as unknown as RouteHandlerMethod;
const deleteCarouselHandler = deleteCarousel as unknown as RouteHandlerMethod;

const carouselContentSchema = {
	type: 'object',
	required: ['durationSeconds', 'transition', 'slides'],
	properties: {
		size: { type: 'string', enum: ['SMALL', 'MEDIUM', 'LARGE'] },
		durationSeconds: { type: 'number' },
		transition: { type: 'string', enum: ['FADE', 'SLIDE', 'ZOOM', 'NONE'] },
		slides: {
			type: 'array',
			items: {
				type: 'object',
				required: ['imageUrl', 'html'],
				properties: {
					html: { type: 'string' },
					imageUrl: { type: 'string' },
				},
			},
		},
	},
};

const userSummarySchema = {
	type: 'object',
	required: ['id', 'name'],
	properties: { id: { type: 'string' }, name: { type: 'string' } },
};

const carouselSchema = {
	type: 'object',
	required: [
		'id',
		'name',
		'isActive',
		'content',
		'storeId',
		'createdAt',
		'updatedAt',
		'createdBy',
		'lastModifiedBy',
	],
	properties: {
		id: { type: 'string' },
		name: { type: 'string' },
		isActive: { type: 'boolean' },
		content: carouselContentSchema,
		storeId: { type: 'string' },
		createdAt: { type: 'string' },
		updatedAt: { type: 'string' },
		createdBy: userSummarySchema,
		lastModifiedBy: userSummarySchema,
	},
};

const errorSchema = {
	type: 'object',
	properties: { error: { type: 'string' } },
};

export async function carouselRoutes(fastify: FastifyInstance) {
	fastify.get('/carousels/active', {
		schema: {
			tags: ['Carousels'],
			response: {
				200: {
					type: 'object',
					required: ['carousel'],
					properties: { carousel: { ...carouselSchema, nullable: true } },
				},
				400: errorSchema,
			},
		},
		handler: getActiveCarousel,
	});

	fastify.get('/carousels', {
		preHandler: requireManager,
		schema: {
			tags: ['Carousels'],
			response: {
				200: {
					type: 'object',
					required: ['carousels', 'total'],
					properties: {
						carousels: { type: 'array', items: carouselSchema },
						total: { type: 'number' },
					},
				},
			},
		},
		handler: listCarousels,
	});

	fastify.get('/carousels/:id', {
		preHandler: requireManager,
		schema: {
			tags: ['Carousels'],
			response: {
				200: {
					type: 'object',
					required: ['carousel'],
					properties: { carousel: carouselSchema },
				},
			},
		},
		handler: getCarousel,
	});

	fastify.post(
		'/carousels',
		{
			preHandler: requireManager,
		},
		createCarouselHandler
	);

	fastify.put(
		'/carousels/:id',
		{
			preHandler: requireManager,
		},
		updateCarouselHandler
	);

	fastify.put('/carousels/active', { preHandler: requireManager }, activateCarouselHandler);

	fastify.delete('/carousels/:id', { preHandler: requireManager }, deleteCarouselHandler);
}

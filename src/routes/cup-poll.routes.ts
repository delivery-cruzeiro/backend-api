import { createCupPollGuessSchema } from '@delivery-cruzeiro/types';
import type { FastifyInstance, RouteHandlerMethod } from 'fastify';
import { createCupPollGuess } from '../controllers/cup-poll.controller.js';
import { validateZod } from '../middleware/validate-zod.middleware.js';

const cupPollGuessResponseSchema = {
	type: 'object',
	properties: {
		createdAt: { type: 'string' },
		instagramHandle: { type: 'string' },
		score: { type: 'string' },
	},
};

export async function cupPollRoutes(fastify: FastifyInstance) {
	fastify.post(
		'/cup-poll/guesses',
		{
			preHandler: [validateZod(createCupPollGuessSchema) as RouteHandlerMethod],
			schema: {
				description: 'Registrar palpite da promocao Palpite Certo',
				tags: ['Cup Poll'],
				body: {
					type: 'object',
					required: ['brScore', 'instagramHandle', 'mrScore'],
					properties: {
						brScore: { type: 'number', minimum: 0, maximum: 99 },
						instagramHandle: { type: 'string' },
						mrScore: { type: 'number', minimum: 0, maximum: 99 },
					},
				},
				response: {
					201: {
						type: 'object',
						properties: {
							guess: cupPollGuessResponseSchema,
							message: { type: 'string' },
						},
					},
					409: {
						type: 'object',
						properties: {
							error: { type: 'string' },
						},
					},
				},
			},
		},
		createCupPollGuess as RouteHandlerMethod
	);
}

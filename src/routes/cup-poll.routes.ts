import {
	createCupPollGuessSchema,
	getCupPollGuessQuerySchema,
} from '@delivery-cruzeiro/types';
import type { FastifyInstance, RouteHandlerMethod } from 'fastify';
import { createCupPollGuess, getCupPollGuess } from '../controllers/cup-poll.controller.js';
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
	fastify.get(
		'/cup-poll/guesses',
		{
			preValidation: validateZod(getCupPollGuessQuerySchema, 'query'),
			schema: {
				description: 'Consultar palpite da promocao Palpite Certo por Instagram',
				tags: ['Cup Poll'],
				querystring: {
					type: 'object',
					required: ['instagramHandle'],
					properties: {
						instagramHandle: { type: 'string' },
					},
				},
				response: {
					200: {
						type: 'object',
						properties: {
							guess: {
								anyOf: [cupPollGuessResponseSchema, { type: 'null' }],
							},
							message: { type: 'string' },
						},
					},
					500: {
						type: 'object',
						properties: {
							error: { type: 'string' },
						},
					},
				},
			},
		},
		getCupPollGuess as RouteHandlerMethod
	);

	fastify.post(
		'/cup-poll/guesses',
		{
			preValidation: validateZod(createCupPollGuessSchema),
			schema: {
				description: 'Registrar palpite da promocao Palpite Certo',
				tags: ['Cup Poll'],
				body: {
					type: 'object',
					required: ['brScore', 'instagramHandle', 'jpScore'],
					properties: {
						brScore: { type: 'number', minimum: 0, maximum: 99 },
						instagramHandle: { type: 'string' },
						jpScore: { type: 'number', minimum: 0, maximum: 99 },
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

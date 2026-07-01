import {
	createCupPollMatchWinnerSchema,
	createCupPollGuessSchema,
	getCupPollGuessQuerySchema,
} from '@delivery-cruzeiro/types';
import type { FastifyInstance, RouteHandlerMethod } from 'fastify';
import {
	createCupPollGuess,
	createCupPollMatchWinner,
	getCupPollGuess,
	getCupPollResults,
} from '../controllers/cup-poll.controller.js';
import { validateZod } from '../middleware/validate-zod.middleware.js';

const cupPollGuessResponseSchema = {
	type: 'object',
	properties: {
		createdAt: { type: 'string' },
		instagramHandle: { type: 'string' },
		score: { type: 'string' },
	},
};

const cupPollMatchWinnerResponseSchema = {
	type: 'object',
	properties: {
		'first-winner': { anyOf: [{ type: 'string' }, { type: 'null' }] },
		match: { type: 'string' },
		participants: {
			type: 'array',
			items: { type: 'string' },
		},
		result: { type: 'string' },
		'second-winner': { anyOf: [{ type: 'string' }, { type: 'null' }] },
	},
};

const cupPollResultResponseSchema = cupPollMatchWinnerResponseSchema;

export async function cupPollRoutes(fastify: FastifyInstance) {
	fastify.get(
		'/cup-poll/results',
		{
			schema: {
				description: 'Listar resultados dos boloes da promocao Palpite Certo',
				tags: ['Cup Poll'],
				response: {
					200: {
						type: 'array',
						items: cupPollResultResponseSchema,
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
		getCupPollResults as RouteHandlerMethod
	);

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

	await cupPollNewMatchRoutes(fastify);
}

export async function cupPollNewMatchRoutes(fastify: FastifyInstance) {
	fastify.post(
		'/newMatch',
		{
			preValidation: validateZod(createCupPollMatchWinnerSchema),
			schema: {
				description: 'Registrar vencedores de um jogo da promocao Palpite Certo',
				tags: ['Cup Poll'],
				body: {
					type: 'object',
					required: ['match', 'result'],
					properties: {
						match: { type: 'string', pattern: '^br-[a-z]{2}$' },
						result: {
							type: 'string',
							pattern: '^br\\([0-9]+\\)-[a-z]{2}\\([0-9]+\\)$',
						},
					},
				},
				response: {
					201: {
						type: 'object',
						properties: {
							matchWinner: cupPollMatchWinnerResponseSchema,
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
		createCupPollMatchWinner as RouteHandlerMethod
	);
}

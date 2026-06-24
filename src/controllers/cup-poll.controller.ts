import type {
	CreateCupPollGuessDTO,
	GetCupPollGuessQueryDTO,
} from '@delivery-cruzeiro/types';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { CupPollDuplicateGuessError, CupPollService } from '../services/cup-poll.service.js';

const cupPollService = new CupPollService();

export const createCupPollGuess = async (
	request: FastifyRequest<{ Body: CreateCupPollGuessDTO }>,
	reply: FastifyReply
) => {
	try {
		const guess = await cupPollService.createGuess(request.body);

		return reply.status(201).send({
			guess: {
				createdAt: guess.createdAt,
				instagramHandle: guess.instagramHandle,
				score: guess.score,
			},
			message: 'Palpite registrado com sucesso',
		});
	} catch (error) {
		if (error instanceof CupPollDuplicateGuessError) {
			return reply.status(409).send({
				error: error.message,
			});
		}

		console.error('Erro ao registrar palpite:', error);
		return reply.status(500).send({
			error: 'Erro interno do servidor',
		});
	}
};

export const getCupPollGuess = async (
	request: FastifyRequest<{ Querystring: GetCupPollGuessQueryDTO }>,
	reply: FastifyReply
) => {
	try {
		const guess = await cupPollService.findGuessByInstagramHandle(
			request.query.instagramHandle,
		);

		if (!guess) {
			return reply.status(200).send({
				guess: null,
				message: 'Nenhum palpite encontrado para este Instagram',
			});
		}

		return reply.status(200).send({
			guess: {
				createdAt: guess.createdAt,
				instagramHandle: guess.instagramHandle,
				score: guess.score,
			},
			message: 'Palpite encontrado',
		});
	} catch (error) {
		console.error('Erro ao consultar palpite:', error);
		return reply.status(500).send({
			error: 'Erro interno do servidor',
		});
	}
};

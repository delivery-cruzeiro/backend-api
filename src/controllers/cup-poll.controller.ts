import type {
	CreateCupPollGuessDTO,
	CreateCupPollMatchWinnerDTO,
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
			request.query.instagramHandle
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

export const createCupPollMatchWinner = async (
	request: FastifyRequest<{ Body: CreateCupPollMatchWinnerDTO }>,
	reply: FastifyReply
) => {
	try {
		const matchWinner = await cupPollService.createMatchWinner(request.body);

		return reply.status(201).send({
			matchWinner,
			message: 'Vencedores do jogo registrados com sucesso',
		});
	} catch (error) {
		console.error('Erro ao registrar vencedores do jogo:', error);
		return reply.status(500).send({
			error: 'Erro interno do servidor',
		});
	}
};

export const getCupPollResults = async (_request: FastifyRequest, reply: FastifyReply) => {
	try {
		const results = await cupPollService.listResults();

		return reply.status(200).send(results);
	} catch (error) {
		console.error('Erro ao consultar resultados dos boloes:', error);
		return reply.status(500).send({
			error: 'Erro interno do servidor',
		});
	}
};

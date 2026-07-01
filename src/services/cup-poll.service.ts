import type {
	CreateCupPollGuessDTO,
	CreateCupPollMatchWinnerDTO,
} from '@delivery-cruzeiro/types';
import { Prisma } from '@prisma/client';
import { CupPollRepository } from '../repositories/cup-poll.repository.js';

const cupPollHomeTeam = 'br';
const cupPollAwayTeam = 'jp';

export class CupPollDuplicateGuessError extends Error {
	constructor() {
		super('Este Instagram ja registrou um palpite para este jogo');
		this.name = 'CupPollDuplicateGuessError';
	}
}

export class CupPollService {
	constructor(private readonly repository = new CupPollRepository()) {}

	async createGuess(input: CreateCupPollGuessDTO) {
		const instagramHandle = input.instagramHandle.trim().toLowerCase();
		const scoreFormat = `${cupPollHomeTeam}-${cupPollAwayTeam}`;
		const existingGuess = await this.repository.findByInstagramHandleAndScoreFormat(
			instagramHandle,
			scoreFormat
		);

		if (existingGuess) {
			throw new CupPollDuplicateGuessError();
		}

		const score = `${cupPollHomeTeam}(${input.brScore})-${cupPollAwayTeam}(${input.jpScore})`;

		try {
			return await this.repository.create({
				instagramHandle,
				score,
				scoreFormat,
			});
		} catch (error) {
			if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
				throw new CupPollDuplicateGuessError();
			}

			throw error;
		}
	}

	findGuessByInstagramHandle(instagramHandle: string) {
		const normalizedInstagramHandle = instagramHandle.trim().toLowerCase();
		const scoreFormat = `${cupPollHomeTeam}-${cupPollAwayTeam}`;

		return this.repository.findLatestByInstagramHandleAndScoreFormat(
			normalizedInstagramHandle,
			scoreFormat
		);
	}

	async listResults() {
		const poolWinners = await this.repository.findPoolWinners();

		return Promise.all(
			poolWinners.map(async poolWinner => {
				const participants = await this.repository.findCorrectParticipants(
					poolWinner.match,
					poolWinner.result,
					poolWinner.firstWinner
				);

				return {
					'first-winner': poolWinner.firstWinner,
					match: poolWinner.match,
					participants: participants.map(
						participant => participant.instagramHandle
					),
					result: poolWinner.result,
					'second-winner': poolWinner.secondWinner,
				};
			})
		);
	}

	async createMatchWinner(input: CreateCupPollMatchWinnerDTO) {
		const match = input.match.trim().toLowerCase();
		const result = input.result.trim().toLowerCase();
		const secondWinner = input['second-winner']?.trim().toLowerCase() ?? null;
		const [matchWinner] = await this.repository.createPoolWinner(
			match,
			result,
			secondWinner
		);
		const participants = await this.repository.findCorrectParticipants(
			matchWinner.match,
			matchWinner.result,
			matchWinner.firstWinner
		);

		return {
			'first-winner': matchWinner.firstWinner,
			match: matchWinner.match,
			participants: participants.map(participant => participant.instagramHandle),
			result: matchWinner.result,
			'second-winner': matchWinner.secondWinner,
		};
	}
}

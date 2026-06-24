import type { CreateCupPollGuessDTO } from '@delivery-cruzeiro/types';
import { Prisma } from '@prisma/client';
import { CupPollRepository } from '../repositories/cup-poll.repository.js';

const cupPollHomeTeam = 'br';
const cupPollAwayTeam = 'sc';

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
			scoreFormat,
		);

		if (existingGuess) {
			throw new CupPollDuplicateGuessError();
		}

		const score = `${cupPollHomeTeam}(${input.brScore})-${cupPollAwayTeam}(${input.scScore})`;

		try {
			return await this.repository.create({
				instagramHandle,
				score,
				scoreFormat,
			});
		} catch (error) {
			if (
				error instanceof Prisma.PrismaClientKnownRequestError &&
				error.code === 'P2002'
			) {
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
			scoreFormat,
		);
	}
}

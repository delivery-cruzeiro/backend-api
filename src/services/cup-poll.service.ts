import type { CreateCupPollGuessDTO } from '@delivery-cruzeiro/types';
import { CupPollRepository } from '../repositories/cup-poll.repository.js';

export class CupPollDuplicateGuessError extends Error {
	constructor() {
		super('Este Instagram ja registrou um palpite');
		this.name = 'CupPollDuplicateGuessError';
	}
}

export class CupPollService {
	constructor(private readonly repository = new CupPollRepository()) {}

	async createGuess(input: CreateCupPollGuessDTO) {
		const instagramHandle = input.instagramHandle.trim().toLowerCase();
		const existingGuess = await this.repository.findByInstagramHandle(instagramHandle);

		if (existingGuess) {
			throw new CupPollDuplicateGuessError();
		}

		const score = `br(${input.brScore})-ht(${input.mrScore})`;

		return this.repository.create({
			instagramHandle,
			score,
		});
	}
}

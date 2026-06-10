import { prisma } from '../lib/prisma.js';

export type CreateCupPollGuessRecord = {
	instagramHandle: string;
	score: string;
};

export class CupPollRepository {
	findByInstagramHandle(instagramHandle: string) {
		return prisma.cupPollGuess.findUnique({
			where: { instagramHandle },
		});
	}

	create(input: CreateCupPollGuessRecord) {
		return prisma.cupPollGuess.create({
			data: input,
		});
	}
}

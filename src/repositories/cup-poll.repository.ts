import { prisma } from '../lib/prisma.js';

export type CreateCupPollGuessRecord = {
	instagramHandle: string;
	score: string;
	scoreFormat: string;
};

export class CupPollRepository {
	findByInstagramHandleAndScoreFormat(instagramHandle: string, scoreFormat: string) {
		return prisma.cupPollGuess.findFirst({
			where: {
				instagramHandle,
				scoreFormat,
			},
		});
	}

	create(input: CreateCupPollGuessRecord) {
		return prisma.cupPollGuess.create({
			data: input,
		});
	}
}

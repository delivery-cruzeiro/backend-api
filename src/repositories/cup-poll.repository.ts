import { prisma } from '../lib/prisma.js';

export type CreateCupPollGuessRecord = {
	instagramHandle: string;
	score: string;
	scoreFormat: string;
};

export type PoolWinnerRecord = {
	match: string;
	result: string;
	firstWinner: string | null;
	secondWinner: string | null;
};

export type CorrectParticipantRecord = {
	instagramHandle: string;
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

	findLatestByInstagramHandleAndScoreFormat(instagramHandle: string, scoreFormat: string) {
		return prisma.cupPollGuess.findFirst({
			orderBy: {
				createdAt: 'desc',
			},
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

	findPoolWinners() {
		return prisma.$queryRaw<PoolWinnerRecord[]>`
			SELECT
				"match",
				"result",
				"first_winner" AS "firstWinner",
				"second_winner" AS "secondWinner"
			FROM "pool_winners"
			ORDER BY "created_at" DESC
		`;
	}

	findCorrectParticipants(match: string, result: string, firstWinner: string | null) {
		return prisma.$queryRaw<CorrectParticipantRecord[]>`
			SELECT "instagram_handle" AS "instagramHandle"
			FROM "cup_poll_guesses"
			WHERE "score_format" = ${match}
				AND "score" = ${result}
				AND (
					${firstWinner}::TEXT IS NULL
					OR "instagram_handle" <> ${firstWinner}
				)
			ORDER BY "created_at" ASC
		`;
	}

	async findFirstCorrectParticipant(match: string, result: string) {
		const participants = await prisma.$queryRaw<CorrectParticipantRecord[]>`
			SELECT "instagram_handle" AS "instagramHandle"
			FROM "cup_poll_guesses"
			WHERE "score_format" = ${match}
				AND "score" = ${result}
			ORDER BY "created_at" ASC, "id" ASC
			LIMIT 1
		`;

		return participants[0] ?? null;
	}

	createPoolWinner(
		match: string,
		result: string,
		firstWinner: string | null,
		secondWinner: string | null
	) {
		return prisma.$queryRaw<PoolWinnerRecord[]>`
			WITH upserted AS (
				INSERT INTO "pool_winners" (
					"match",
					"result",
					"first_winner",
					"second_winner",
					"created_at",
					"updated_at"
				)
				VALUES (
					${match},
					${result},
					${firstWinner},
					${secondWinner},
					CURRENT_TIMESTAMP,
					CURRENT_TIMESTAMP
				)
				ON CONFLICT ("match")
				DO UPDATE SET
					"result" = EXCLUDED."result",
					"first_winner" = EXCLUDED."first_winner",
					"second_winner" = EXCLUDED."second_winner",
					"updated_at" = CURRENT_TIMESTAMP
				RETURNING "match"
			)
			UPDATE "pool_winners"
			SET
				"first_winner" = ${firstWinner},
				"second_winner" = ${secondWinner},
				"updated_at" = CURRENT_TIMESTAMP
			WHERE "match" = (SELECT "match" FROM upserted)
			RETURNING
				"match",
				"result",
				"first_winner" AS "firstWinner",
				"second_winner" AS "secondWinner"
		`;
	}
}

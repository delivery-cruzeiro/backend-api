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
  return prisma.poolWinner.findMany({orderBy:{createdAt:'desc'},select:{match:true,result:true,firstWinner:true,secondWinner:true}});
 }
 findCorrectParticipants(match: string,result: string,firstWinner: string|null) {
  return prisma.cupPollGuess.findMany({where:{scoreFormat:match,score:result,...(firstWinner?{instagramHandle:{not:firstWinner}}:{})},orderBy:{createdAt:'asc'},select:{instagramHandle:true}});
 }
 findFirstCorrectParticipant(match:string,result:string) {
  return prisma.cupPollGuess.findFirst({where:{scoreFormat:match,score:result},orderBy:[{createdAt:'asc'},{id:'asc'}],select:{instagramHandle:true}});
 }
 async createPoolWinner(match:string,result:string,firstWinner:string|null,secondWinner:string|null) {
  return [await prisma.poolWinner.upsert({where:{match},create:{match,result,firstWinner,secondWinner},update:{result,firstWinner,secondWinner},select:{match:true,result:true,firstWinner:true,secondWinner:true}})];
 }
}

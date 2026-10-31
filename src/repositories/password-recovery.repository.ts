import { prisma } from '../lib/prisma.js';

export class PasswordRecoveryRepository {
	async findUser(email: string) {
		return prisma.user.findFirst({
			where: {
				email: { equals: email, mode: 'insensitive' },
				isActive: true,
				accounts: { some: { providerId: 'credential', password: { not: null } } },
			},
			select: { id: true, email: true },
		});
	}

	async issue(key: string, userId: string, codeHash: string, now: Date, expiresAt: Date) {
		return prisma.$transaction(async tx => {
			await tx.passwordRecovery.upsert({
				where: { key },
				update: { key },
				create: {
					key,
					userId,
					expiresAt,
					lastSentAt: new Date(0),
				},
			});
			const result = await tx.passwordRecovery.updateMany({
				where: { key, lastSentAt: { lte: new Date(now.getTime() - 60000) } },
				data: {
					userId,
					codeHash,
					authorizationHash: null,
					attempts: 0,
					expiresAt,
					lastSentAt: now,
				},
			});
			return result.count === 1;
		});
	}

	async verify(key: string, codeHash: string, authorizationHash: string, now: Date) {
		return prisma.$transaction(async tx => {
			// Increment first to serialize competing guesses across all API instances.
			const attempt = await tx.passwordRecovery.updateMany({
				where: {
					key,
					expiresAt: { gt: now },
					codeHash: { not: null },
					attempts: { lt: 5 },
				},
				data: { attempts: { increment: 1 } },
			});
			if (!attempt.count) return false;
			const verified = await tx.passwordRecovery.updateMany({
				where: { key, codeHash, expiresAt: { gt: now }, attempts: { lte: 5 } },
				data: { codeHash: null, authorizationHash },
			});
			return verified.count === 1;
		});
	}

	async reset(key: string, authorizationHash: string, password: string, now: Date) {
		return prisma.$transaction(async tx => {
			const recovery = await tx.passwordRecovery.findUnique({ where: { key } });
			if (!recovery) return null;
			// Consume and update credentials in the same transaction; only one request wins.
			const consumed = await tx.passwordRecovery.deleteMany({
				where: { key, authorizationHash, expiresAt: { gt: now } },
			});
			if (!consumed.count) return null;
			const account = await tx.account.updateMany({
				where: {
					userId: recovery.userId,
					providerId: 'credential',
					user: { isActive: true },
				},
				data: { password },
			});
			if (!account.count) throw new Error('Credential account unavailable');
			await tx.user.update({ where: { id: recovery.userId }, data: { password: null } });
			await tx.session.deleteMany({ where: { userId: recovery.userId } });
			return recovery.userId;
		});
	}

	async discard(key: string, codeHash: string) {
		await prisma.passwordRecovery.deleteMany({ where: { key, codeHash } });
	}
	async cleanup() {
		const now = new Date();
		await prisma.passwordRecovery.deleteMany({ where: { expiresAt: { lte: now } } });
		await prisma.loginAttempt.deleteMany({ where: { expiresAt: { lte: now } } });
	}
}

import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { hashPassword, verifyPassword } from 'better-auth/crypto';
import Fastify from 'fastify';
import { prisma } from '../../src/lib/prisma.js';
import { PasswordRecoveryRepository } from '../../src/repositories/password-recovery.repository.js';
import { PasswordRecoveryService } from '../../src/services/password-recovery.service.js';
import { passwordRecoveryRoutes } from '../../src/routes/password-recovery.routes.js';
import type { EmailMessage } from '../../src/services/email.service.js';

// Opt in against a migrated database. Fixtures never change existing accounts.
describe.skipIf(process.env.PASSWORD_RECOVERY_DB_TEST !== 'true')(
	'password recovery database integration',
	() => {
		const id = `recovery-test-${randomUUID()}`;
		const email = `${id}@example.invalid`;
		const repository = new PasswordRecoveryRepository();
		const messages: EmailMessage[] = [];
		let now = new Date();
		const service = new PasswordRecoveryService(
			repository,
			{
				assertConfigured() {},
				async send(message) {
					messages.push(message);
				},
			},
			() => now
		);
		const code = () => messages.at(-1)!.text.match(/\n(\d{6})\n/)![1];
		beforeAll(async () => {
			await prisma.user.create({
				data: {
					id,
					name: 'Temporary recovery verification',
					email,
					phone: '11999999999',
					accounts: {
						create: {
							id,
							accountId: id,
							providerId: 'credential',
							password: await hashPassword('old-password123'),
						},
					},
				},
			});
		});
		afterAll(async () => {
			await prisma.passwordRecovery.deleteMany({ where: { userId: id } });
			await prisma.user.deleteMany({ where: { id } });
		});
		it('serializes resends and guesses, expires codes, and atomically changes credentials and revokes sessions', async () => {
			await Promise.all([service.request(email, () => {}), service.request(email, () => {})]);
			expect(messages).toHaveLength(1);
			const firstCode = code();
			now = new Date(now.getTime() + 60001);
			await service.request(email, () => {});
			expect(messages).toHaveLength(2);
			await expect(service.verify(email, firstCode)).rejects.toThrow();
			const current = code();
			const wrong = current === '000000' ? '111111' : '000000';
			await Promise.all(
				Array.from({ length: 6 }, () => service.verify(email, wrong).catch(() => null))
			);
			await expect(service.verify(email, current)).rejects.toThrow();
			now = new Date(now.getTime() + 60001);
			await service.request(email, () => {});
			const expiring = code();
			now = new Date(now.getTime() + 30 * 60000);
			await expect(service.verify(email, expiring)).rejects.toThrow();
			await service.request(email, () => {});
			const results = await Promise.allSettled([
				service.verify(email, code()),
				service.verify(email, code()),
			]);
			expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(1);
			const grant = results.find(
				result => result.status === 'fulfilled'
			) as PromiseFulfilledResult<{ recoveryAuthorization: string }>;
			await prisma.session.create({
				data: {
					id,
					userId: id,
					token: randomUUID(),
					expiresAt: new Date(Date.now() + 600000),
				},
			});
			const resets = await Promise.allSettled([
				service.reset(email, grant.value.recoveryAuthorization, 'new-password123'),
				service.reset(email, grant.value.recoveryAuthorization, 'new-password123'),
			]);
			expect(resets.filter(result => result.status === 'fulfilled')).toHaveLength(1);
			expect(await prisma.session.count({ where: { userId: id } })).toBe(0);
			expect(await prisma.passwordRecovery.count({ where: { userId: id } })).toBe(0);
			const account = await prisma.account.findUniqueOrThrow({ where: { id } });
			expect(
				await verifyPassword({ hash: account.password!, password: 'new-password123' })
			).toBe(true);
			expect(
				await verifyPassword({ hash: account.password!, password: 'old-password123' })
			).toBe(false);
		});
		it('rejects malformed requests, mismatched passwords and forged authorization at the HTTP boundary', async () => {
			const app = Fastify();
			await app.register(passwordRecoveryRoutes);
			try {
				for (const [path, payload] of [
					['request', { email: 'invalid' }],
					['verify', { email, code: '12345' }],
					[
						'reset',
						{
							email,
							recoveryAuthorization: 'a'.repeat(64),
							password: 'password123',
							confirmPassword: 'different123',
						},
					],
					[
						'reset',
						{
							email,
							recoveryAuthorization: 'a'.repeat(64),
							password: 'password123',
							confirmPassword: 'password123',
						},
					],
				] as const) {
					const response = await app.inject({
						method: 'POST',
						url: `/auth/password-recovery/${path}`,
						payload,
					});
					expect(response.statusCode).toBe(400);
					expect(response.json()).not.toHaveProperty('recoveryAuthorization');
				}
			} finally {
				await app.close();
			}
		});
	}
);

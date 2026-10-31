import { beforeEach, describe, expect, it, vi } from 'vitest';
import { verifyPassword } from 'better-auth/crypto';
import { PasswordRecoveryService } from '../../src/services/password-recovery.service.js';
import type { PasswordRecoveryRepository } from '../../src/repositories/password-recovery.repository.js';
import type { EmailSender, EmailMessage } from '../../src/services/email.service.js';

vi.mock('../../src/lib/prisma.js', () => ({ prisma: {} }));

describe('password recovery service', () => {
	let now: Date;
	let messages: EmailMessage[];
	let record: {
		key: string;
		userId: string;
		codeHash: string | null;
		authorizationHash: string | null;
		expiresAt: Date;
		attempts: number;
		lastSentAt: Date;
	} | null;
	let changedPassword: string;
	let sender: EmailSender;
	let service: PasswordRecoveryService;
	let failDelivery: boolean;
	const failure = vi.fn();
	beforeEach(() => {
		process.env.BETTER_AUTH_SECRET = 'test-only-secret-with-at-least-32-characters';
		now = new Date('2026-10-25T12:00:00Z');
		messages = [];
		record = null;
		changedPassword = '';
		failDelivery = false;
		failure.mockClear();
		sender = {
			assertConfigured: vi.fn(),
			send: async message => {
				if (failDelivery) throw new Error('SMTP failure');
				messages.push(message);
			},
		};
		const repository = {
			findUser: async (email: string) =>
				email === 'user@example.com' ? { id: 'user-1', email } : null,
			issue: async (
				key: string,
				userId: string,
				codeHash: string,
				issuedAt: Date,
				expiresAt: Date
			) => {
				if (record && issuedAt.getTime() - record.lastSentAt.getTime() < 60000)
					return false;
				record = {
					key,
					userId,
					codeHash,
					authorizationHash: null,
					expiresAt,
					attempts: 0,
					lastSentAt: issuedAt,
				};
				return true;
			},
			verify: async (key: string, codeHash: string, authorizationHash: string, at: Date) => {
				if (
					!record ||
					record.key !== key ||
					!record.codeHash ||
					record.expiresAt <= at ||
					record.attempts >= 5
				)
					return false;
				record.attempts++;
				if (record.codeHash !== codeHash) return false;
				record.authorizationHash = authorizationHash;
				record.codeHash = null;
				return true;
			},
			reset: async (key: string, authorizationHash: string, password: string, at: Date) => {
				if (
					!record ||
					record.key !== key ||
					record.authorizationHash !== authorizationHash ||
					record.expiresAt <= at
				)
					return null;
				changedPassword = password;
				record = null;
				return 'user-1';
			},
			discard: async () => {
				record = null;
			},
		} as unknown as PasswordRecoveryRepository;
		service = new PasswordRecoveryService(repository, sender, () => now);
	});
	const sentCode = (message: EmailMessage) => message.text.match(/\n(\d{6})\n/)![1];
	it('sends the approved email, persists no raw code, and changes a Better Auth compatible password once', async () => {
		await service.request('user@example.com', failure);
		const code = sentCode(messages[0]);
		expect(record!.codeHash).toHaveLength(64);
		expect(record!.codeHash).not.toBe(code);
		expect(messages[0].text).toContain('30 minutos');
		expect(messages[0].text).toContain('invalidado imediatamente');
		const authorization = await service.verify('user@example.com', code);
		expect(record!.authorizationHash).not.toBe(authorization.recoveryAuthorization);
		await expect(service.verify('user@example.com', code)).rejects.toThrow();
		await service.reset(
			'user@example.com',
			authorization.recoveryAuthorization,
			'new-password123'
		);
		expect(await verifyPassword({ hash: changedPassword, password: 'new-password123' })).toBe(
			true
		);
		await expect(
			service.reset('user@example.com', authorization.recoveryAuthorization, 'other-password')
		).rejects.toThrow();
	});
	it('rejects codes at exactly 30 minutes and does not extend expiration after verification', async () => {
		await service.request('user@example.com', failure);
		const code = sentCode(messages[0]);
		now = new Date(now.getTime() + 29 * 60000);
		const grant = await service.verify('user@example.com', code);
		now = new Date(now.getTime() + 60000);
		await expect(
			service.reset('user@example.com', grant.recoveryAuthorization, 'new-password123')
		).rejects.toThrow();
		await expect(service.verify('user@example.com', code)).rejects.toThrow();
	});
	it('resending invalidates previous codes and previously granted authorization', async () => {
		await service.request('user@example.com', failure);
		const oldCode = sentCode(messages[0]);
		const grant = await service.verify('user@example.com', oldCode);
		now = new Date(now.getTime() + 60000);
		await service.request('user@example.com', failure);
		await expect(service.verify('user@example.com', oldCode)).rejects.toThrow();
		await expect(
			service.reset('user@example.com', grant.recoveryAuthorization, 'new-password123')
		).rejects.toThrow();
		await expect(
			service.verify('user@example.com', sentCode(messages[1]))
		).resolves.toHaveProperty('recoveryAuthorization');
	});
	it('enforces five guesses, a resend cooldown, and account binding', async () => {
		await service.request('user@example.com', failure);
		await service.request('user@example.com', failure);
		expect(messages).toHaveLength(1);
		const code = sentCode(messages[0]);
		await expect(service.verify('other@example.com', code)).rejects.toThrow();
		const wrongCode = code === '111111' ? '222222' : '111111';
		for (let i = 0; i < 5; i++)
			await expect(service.verify('user@example.com', wrongCode)).rejects.toThrow();
		await expect(service.verify('user@example.com', code)).rejects.toThrow();
	});
	it('does not send to unknown accounts and discards failed deliveries without revealing account existence', async () => {
		await expect(service.request('absent@example.com', failure)).resolves.toBeUndefined();
		expect(messages).toHaveLength(0);
		failDelivery = true;
		await expect(service.request('user@example.com', failure)).resolves.toBeUndefined();
		await service.waitForDeliveries();
		expect(record).toBeNull();
		expect(failure).toHaveBeenCalledOnce();
	});
});

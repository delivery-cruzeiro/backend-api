import { createHmac, randomBytes } from 'node:crypto';
import { prisma } from '../lib/prisma.js';
import { securityConfig } from '../security/config.js';
import { databaseIdentity } from '../security/database-context.js';
import { emailConfirmationEmail } from './email-confirmation-email.js';
import { SmtpEmailSender, type EmailSender } from './email.service.js';

const dayMs = 24 * 60 * 60 * 1000;
const resendIntervalMs = 15 * 60 * 1000;

export class EmailConfirmationError extends Error {
	constructor(message: string, readonly statusCode: number, readonly retryAfter?: number) {
		super(message);
	}
}

export class EmailConfirmationService {
	private readonly pending = new Set<Promise<void>>();

	constructor(
		private readonly sender: EmailSender = new SmtpEmailSender(),
		private readonly now = () => new Date()
	) {}

	private digest(purpose: 'email' | 'code', value: string) {
		const secret = process.env.BETTER_AUTH_SECRET;
		if (!secret) throw new Error('Authentication secret is required');
		return createHmac('sha256', secret).update(`email-confirmation:${purpose}\0${value}`).digest('hex');
	}

	sendOnRegistration(userId: string, onFailure: () => void) {
		const delivery = this.send(userId).then(() => undefined).catch(onFailure);
		this.pending.add(delivery);
		void delivery.finally(() => this.pending.delete(delivery));
	}

	async waitForDeliveries() {
		await Promise.all(this.pending);
	}

	async send(userId: string) {
		return databaseIdentity.run({ kind: 'system' }, async () => {
			const user = await prisma.user.findUnique({
				where: { id: userId },
				select: { email: true, emailVerified: true, isActive: true },
			});
			if (!user?.isActive) throw new EmailConfirmationError('Conta indisponível.', 403);
			if (user.emailVerified) return 'Seu e-mail já está confirmado.';

			const unavailable = () => new EmailConfirmationError(
				'Não foi possível enviar o e-mail de confirmação agora. Tente novamente mais tarde.', 503
			);
			try { this.sender.assertConfigured(); } catch { throw unavailable(); }

			const code = randomBytes(32).toString('hex');
			const codeHash = this.digest('code', code);
			const emailHash = this.digest('email', user.email);
			const url = new URL('/register/confirm-email', securityConfig().baseURL);
			url.hash = new URLSearchParams({ code }).toString();
			const reservation = await prisma.$transaction(async tx => {
				// The upsert locks this user's row across concurrent requests and API instances.
				const previous = await tx.emailConfirmation.upsert({
					where: { userId }, create: { userId }, update: { userId },
				});
				const currentUser = await tx.user.findUnique({
					where: { id: userId }, select: { email: true, emailVerified: true, isActive: true },
				});
				if (currentUser?.emailVerified) return null;
				if (!currentUser?.isActive || currentUser.email !== user.email) throw unavailable();

				const now = this.now();
				const nextSendAt = Math.max(
					previous.lastSentAt ? previous.lastSentAt.getTime() + resendIntervalMs : 0,
					previous.previousSentAt ? previous.previousSentAt.getTime() + dayMs : 0
				);
				if (nextSendAt > now.getTime()) {
					throw new EmailConfirmationError(
						'O envio é limitado a dois e-mails em 24 horas, com 15 minutos de intervalo.',
						429, Math.ceil((nextSendAt - now.getTime()) / 1000)
					);
				}
				await tx.emailConfirmation.update({
					where: { userId },
					data: { codeHash, emailHash, expiresAt: new Date(now.getTime() + dayMs),
						lastSentAt: now, previousSentAt: previous.lastSentAt },
				});
				return previous;
			});
			if (!reservation) return 'Seu e-mail já está confirmado.';

			const company = process.env.EMAIL_COMPANY_NAME?.trim() || 'Delivery Cruzeiro';
			try {
				await this.sender.send({
					to: user.email,
					...emailConfirmationEmail(company, url),
				});
			} catch {
				await prisma.emailConfirmation.updateMany({
					where: { userId, codeHash },
					data: { codeHash: reservation.codeHash, emailHash: reservation.emailHash,
						expiresAt: reservation.expiresAt },
				});
				throw unavailable();
			}
			return 'E-mail de confirmação enviado. Confira sua caixa de entrada.';
		});
	}

	async confirm(code: string) {
		const codeHash = this.digest('code', code);
		return databaseIdentity.run({ kind: 'system' }, () => prisma.$transaction(async tx => {
			const confirmation = await tx.emailConfirmation.findUnique({
				where: { codeHash },
				select: { userId: true, emailHash: true, user: { select: { email: true } } },
			});
			if (!confirmation || confirmation.emailHash !== this.digest('email', confirmation.user.email)) return false;
			const active = await tx.emailConfirmation.updateMany({
				where: { codeHash, expiresAt: { gt: this.now() } }, data: { codeHash },
			});
			if (!active.count) return false;
			const updated = await tx.user.updateMany({
				where: { id: confirmation.userId, email: confirmation.user.email, isActive: true },
				data: { emailVerified: true },
			});
			return updated.count === 1;
		}));
	}
}

export const emailConfirmation = new EmailConfirmationService();

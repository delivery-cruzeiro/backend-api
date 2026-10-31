import { createHmac, randomBytes, randomInt } from 'node:crypto';
import { hashPassword } from 'better-auth/crypto';
import { PasswordRecoveryRepository } from '../repositories/password-recovery.repository.js';
import { SmtpEmailSender, type EmailSender } from './email.service.js';
import { passwordRecoveryEmail } from './password-recovery-email.js';
import { sessionEvents } from '../security/session-events.js';

export class PasswordRecoveryError extends Error {
	constructor(
		message = 'Código inválido ou expirado. Solicite um novo código.',
		readonly statusCode = 400
	) {
		super(message);
	}
}

export class PasswordRecoveryService {
	private readonly deliveries = new Set<Promise<void>>();
	constructor(
		private readonly repository = new PasswordRecoveryRepository(),
		private readonly emailSender: EmailSender = new SmtpEmailSender(),
		private readonly now = () => new Date()
	) {}
	private digest(purpose: string, value: string) {
		const secret = process.env.BETTER_AUTH_SECRET;
		if (!secret) throw new Error('Authentication secret is required');
		return createHmac('sha256', secret)
			.update(`password-recovery:${purpose}\0${value}`)
			.digest('hex');
	}
	private key(email: string) {
		return this.digest('email', email);
	}

	async request(email: string, onDeliveryFailure: () => void) {
		try {
			this.emailSender.assertConfigured();
		} catch {
			throw new PasswordRecoveryError(
				'Recuperação indisponível no momento. Tente novamente mais tarde.',
				503
			);
		}
		const user = await this.repository.findUser(email);
		if (!user) return;
		const key = this.key(email);
		const code = randomInt(0, 1000000).toString().padStart(6, '0');
		const codeHash = this.digest('code', `${key}:${code}`);
		const now = this.now();
		if (
			!(await this.repository.issue(
				key,
				user.id,
				codeHash,
				now,
				new Date(now.getTime() + 30 * 60000)
			))
		)
			return;
		// SMTP latency must not reveal whether an account exists in the HTTP response.
		// Graceful shutdown drains pending deliveries; no raw code is persisted.
		const delivery = (async () => {
			try {
				await this.emailSender.send({
					to: user.email,
					...passwordRecoveryEmail(
						process.env.EMAIL_COMPANY_NAME?.trim() || 'Delivery Cruzeiro',
						code
					),
				});
			} catch {
				onDeliveryFailure();
				await this.repository.discard(key, codeHash).catch(() => onDeliveryFailure());
			}
		})();
		this.deliveries.add(delivery);
		void delivery.finally(() => this.deliveries.delete(delivery));
	}

	async waitForDeliveries() {
		await Promise.all(this.deliveries);
	}

	async verify(email: string, code: string) {
		const key = this.key(email);
		const authorization = randomBytes(32).toString('hex');
		if (
			!(await this.repository.verify(
				key,
				this.digest('code', `${key}:${code}`),
				this.digest('authorization', authorization),
				this.now()
			))
		) {
			throw new PasswordRecoveryError();
		}
		return { recoveryAuthorization: authorization };
	}

	async reset(email: string, authorization: string, password: string) {
		const passwordHash = await hashPassword(password);
		const userId = await this.repository.reset(
			this.key(email),
			this.digest('authorization', authorization),
			passwordHash,
			this.now()
		);
		if (!userId)
			throw new PasswordRecoveryError(
				'Autorização inválida ou expirada. Solicite um novo código.'
			);
		sessionEvents.emit('revoked', userId);
	}
}

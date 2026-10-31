import nodemailer from 'nodemailer';

export type EmailMessage = { to: string; subject: string; text: string };
export interface EmailSender {
	assertConfigured(): void;
	send(message: EmailMessage): Promise<void>;
}

/** Credentials belong exclusively to the backend environment. */
export class SmtpEmailSender implements EmailSender {
	assertConfigured() {
		if (
			!process.env.SMTP_HOST ||
			!process.env.SMTP_USER ||
			!process.env.SMTP_PASS ||
			!process.env.SMTP_FROM
		) {
			throw new Error('Email delivery is not configured');
		}
		const port = Number(process.env.SMTP_PORT ?? 587);
		if (!Number.isInteger(port) || port < 1 || port > 65535)
			throw new Error('Invalid SMTP port');
	}

	async send(message: EmailMessage) {
		this.assertConfigured();
		const port = Number(process.env.SMTP_PORT ?? 587);
		const transport = nodemailer.createTransport({
			host: process.env.SMTP_HOST,
			port,
			secure: port === 465,
			requireTLS: true,
			auth: { user: process.env.SMTP_USER!, pass: process.env.SMTP_PASS! },
			connectionTimeout: 10000,
			greetingTimeout: 10000,
			socketTimeout: 15000,
			disableFileAccess: true,
			disableUrlAccess: true,
		});
		try {
			await transport.sendMail({ ...message, from: process.env.SMTP_FROM });
		} finally {
			transport.close();
		}
	}
}

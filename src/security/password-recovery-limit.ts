import { createHash } from 'node:crypto';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { prisma } from '../lib/prisma.js';

export async function limitPasswordRecovery(request: FastifyRequest, reply: FastifyReply) {
	const body = request.body as { email?: unknown } | undefined;
	const email = typeof body?.email === 'string' ? body.email.trim().toLowerCase() : '';
	const now = Date.now();
	const windowMs = 15 * 60000;
	const bucket = Math.floor(now / windowMs);
	const send = request.routeOptions.url?.endsWith('/request');
	for (const [scope, value, max] of [
		['ip', request.ip, send ? 15 : 30],
		['email', email, send ? 5 : 15],
	] as const) {
		const key = createHash('sha256')
			.update(`recovery:${send ? 'send' : 'validate'}:${scope}:${bucket}:${value}`)
			.digest('hex');
		const attempt = await prisma.loginAttempt.upsert({
			where: { key },
			create: { key, attempts: 1, expiresAt: new Date((bucket + 1) * windowMs) },
			update: { attempts: { increment: 1 } },
			select: { attempts: true },
		});
		if (attempt.attempts > max) {
			reply.header('Retry-After', String(Math.ceil(((bucket + 1) * windowMs - now) / 1000)));
			return reply
				.code(429)
				.send({ error: 'Muitas tentativas. Tente novamente mais tarde.' });
		}
	}
	return undefined;
}

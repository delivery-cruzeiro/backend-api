import { createHash } from 'node:crypto';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { prisma } from '../lib/prisma.js';

export const LOGIN_WINDOW_MS = 15 * 60 * 1000;
export async function limitLogin(req: FastifyRequest, reply: FastifyReply) {
 const body = req.body as {email?: unknown} | undefined;
 const email = typeof body?.email === 'string' ? body.email.trim().toLowerCase() : '';
 const now = Date.now();
 const bucket = Math.floor(now / LOGIN_WINDOW_MS);
 const key = createHash('sha256').update(`${bucket}\0${req.ip}\0${email}`).digest('hex');
 const attempt = await prisma.loginAttempt.upsert({
  where:{key}, create:{key, attempts:1, expiresAt:new Date((bucket + 1)*LOGIN_WINDOW_MS)},
  update:{attempts:{increment:1}}, select:{attempts:true},
 });
 if (attempt.attempts > 6) {
  reply.header('Retry-After', String(Math.ceil(((bucket + 1)*LOGIN_WINDOW_MS-now)/1000)));
  return reply.code(429).send({error:'Muitas tentativas. Tente novamente mais tarde'});
 }
 if (Math.random() < 0.01) await prisma.loginAttempt.deleteMany({where:{expiresAt:{lt:new Date(now)}}});
}

import type { FastifyInstance } from 'fastify';
import { securityConfig, hasUrlCredential, isAllowedOrigin } from './config.js';
import { databaseIdentity } from './database-context.js';

const privateFields = new Set(['password','passwordHash','accessToken','refreshToken','idToken','token','apiKey','secret','privateKeyPem','certificatePassword','providerId']);
export function minimizeResponse(value: unknown): unknown {
 if (Array.isArray(value)) return value.map(minimizeResponse);
 if (!value || typeof value !== 'object' || value instanceof Date || Buffer.isBuffer(value) || Object.getPrototypeOf(value) !== Object.prototype) return value;
 return Object.fromEntries(Object.entries(value).filter(([key]) => !privateFields.has(key)).map(([key, item]) => [key, minimizeResponse(item)]));
}

export function registerSecurityHooks(app: FastifyInstance) {
 const config = securityConfig();
 app.addHook('onRequest', (_req, _reply, done) => databaseIdentity.run({kind:'anonymous'}, done));
 app.addHook('onRequest', async (req, reply) => {
  if (hasUrlCredential(req.url)) return reply.code(400).send({error:'Credenciais devem ser enviadas em headers, nunca na URL'});
  const origin = req.headers.origin;
  if (!isAllowedOrigin(origin, config.origins)) return reply.code(403).send({error:'Origem nao permitida'});
  if (!['GET','HEAD','OPTIONS'].includes(req.method) && req.headers['sec-fetch-site'] === 'cross-site') return reply.code(403).send({error:'Origem nao permitida'});
  if (config.secureCookies && req.url !== '/health' && req.protocol !== 'https') return reply.code(400).send({error:'HTTPS obrigatorio'});
  if (req.url.startsWith('/api/')) reply.header('Cache-Control','no-store');
 });
 // Undeclared body fields cannot reach controllers, including nested objects.
 app.addHook('onRoute', route => {
  const close = (schema: unknown): void => {
   if (!schema || typeof schema !== 'object') return;
   const item = schema as Record<string, unknown>;
   if (item.type === 'object' && item.properties && item.additionalProperties === undefined) item.additionalProperties = false;
   for (const child of Object.values(item)) {
    if (Array.isArray(child)) child.forEach(close);
    else if (child && typeof child === 'object') { close(child); Object.values(child).forEach(close); }
   }
  };
  close(route.schema?.body);
 });
 app.setErrorHandler((error, req, reply) => {
  req.log.error({err:error},'Request failed');
  const typed = error as {validation?: unknown; statusCode?:number};
  const status = typed.validation ? 400 : (typed.statusCode && typed.statusCode >= 400 && typed.statusCode < 500 ? typed.statusCode : 500);
  reply.code(status).send({error: status >= 500 ? 'Erro interno do servidor' : 'Requisicao invalida'});
 });
 app.addHook('preSerialization', async (_req, _reply, payload) => minimizeResponse(payload));
 // Some controllers catch database exceptions themselves. Mask every server error
 // after serialization too, so response schemas cannot accidentally reintroduce it.
 app.addHook('onSend', async (_req, reply, payload) => {
  if (reply.statusCode >= 500) {
   reply.removeHeader('content-length');
   reply.type('application/json');
   return JSON.stringify({error:'Erro interno do servidor'});
  }
  return payload;
 });
}

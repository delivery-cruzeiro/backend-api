import Fastify, { type FastifyReply, type FastifyRequest } from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import multipart from '@fastify/multipart';
import rateLimit from '@fastify/rate-limit';
import dotenv from 'dotenv';
import { auth } from './lib/auth.js';
import { orderEventsEmitter } from './events/order-events.emitter.js';
import { SocketGateway } from './gateways/socket.gateway.js';
import { appConfigRoutes } from './routes/app-config.routes.js';
import { authRoutes } from './routes/auth.routes.js';
import { categoryRoutes } from './routes/category.routes.js';
import { clientRoutes } from './routes/client.routes.js';
import { cupPollRoutes } from './routes/cup-poll.routes.js';
import { menuRoutes } from './routes/menu.routes.js';
import { invoiceRoutes } from './routes/invoice.routes.js';
import { orderRoutes } from './routes/order.routes.js';
import { productRoutes } from './routes/product.routes.js';
import { promotionRoutes } from './routes/promotion.routes.js';
import { storeRoutes } from './routes/store.routes.js';
import { subcategoryRoutes } from './routes/subcategory.routes.js';
import { userRoutes } from './routes/user.routes.js';
import { ensureDefaultAdminInvariant } from './services/admin-invariant.service.js';

dotenv.config();

const fastify = Fastify({
	logger: {
		level: process.env.LOG_LEVEL || 'info',
	},
});

function isAllowedOrigin(_origin?: string) {
	return true;
}

function toWebHeaders(headers: FastifyRequest['headers']) {
	const webHeaders = new Headers();

	for (const [key, value] of Object.entries(headers)) {
		if (value === undefined || key.toLowerCase() === 'content-length') {
			continue;
		}

		if (Array.isArray(value)) {
			webHeaders.set(key, value.join(', '));
			continue;
		}

		webHeaders.set(key, String(value));
	}

	return webHeaders;
}

function copyWebResponseHeaders(response: Response, reply: FastifyReply) {
	response.headers.forEach((value, key) => {
		if (key.toLowerCase() === 'set-cookie' || key.toLowerCase() === 'content-length') {
			return;
		}

		reply.header(key, value);
	});

	const headers = response.headers as Headers & {
		getSetCookie?: () => string[];
	};
	const cookies = headers.getSetCookie?.() ?? [];
	const fallbackCookie = response.headers.get('set-cookie');

	if (cookies.length > 0) {
		reply.header('set-cookie', cookies);
	} else if (fallbackCookie) {
		reply.header('set-cookie', fallbackCookie);
	}
}

const startServer = async () => {
	try {
		await fastify.register(cors, {
			origin: async (origin: string | undefined) => {
				if (isAllowedOrigin(origin)) {
					return true;
				}

				throw new Error('Origem nao permitida pelo CORS');
			},
			credentials: true,
		});

		await fastify.register(helmet, {
			contentSecurityPolicy: {
				directives: {
					defaultSrc: ["'self'"],
					styleSrc: ["'self'", "'unsafe-inline'"],
					scriptSrc: ["'self'"],
					imgSrc: ["'self'", 'data:', 'https:'],
				},
			},
		});

		await fastify.register(rateLimit, {
			max: 100,
			timeWindow: '1 minute',
		});

		await fastify.register(multipart, {
			limits: {
				fileSize: 5 * 1024 * 1024,
				files: 1,
			},
		});

		fastify.addHook('onRequest', async (_request, reply) => {
			reply.header('Access-Control-Allow-Credentials', 'true');
		});

		const socketGateway = new SocketGateway({
			corsOrigin: (
				origin: string | undefined,
				callback: (error: Error | null, allow?: boolean) => void
			) => {
				if (isAllowedOrigin(origin)) {
					callback(null, true);
					return;
				}

				callback(new Error('Origem nao permitida pelo CORS'), false);
			},
			eventEmitter: orderEventsEmitter,
			httpServer: fastify.server,
		});

		fastify.addHook('onClose', async () => {
			await socketGateway.close();
		});

		fastify.get('/health', async () => {
			return {
				status: 'ok',
				timestamp: new Date().toISOString(),
				uptime: process.uptime(),
			};
		});

		fastify.get('/api/test', async () => {
			return {
				message: 'API funcionando corretamente!',
				version: '1.0.0',
				timestamp: new Date().toISOString(),
			};
		});

		await fastify.register(authRoutes, { prefix: '/api' });
		await fastify.register(appConfigRoutes, { prefix: '/api' });
		await fastify.register(categoryRoutes, { prefix: '/api' });
		await fastify.register(clientRoutes, { prefix: '/api' });
		await fastify.register(cupPollRoutes, { prefix: '/api' });
		await fastify.register(invoiceRoutes, { prefix: '/api' });
		await fastify.register(menuRoutes, { prefix: '/api' });
		await fastify.register(orderRoutes, { prefix: '/api' });
		await fastify.register(productRoutes, { prefix: '/api' });
		await fastify.register(promotionRoutes, { prefix: '/api' });
		await fastify.register(storeRoutes, { prefix: '/api' });
		await fastify.register(subcategoryRoutes, { prefix: '/api' });
		await fastify.register(userRoutes, { prefix: '/api' });
		await ensureDefaultAdminInvariant();

		fastify.all('/api/auth/*', async (request, reply) => {
			const baseURL =
				process.env.BETTER_AUTH_URL ?? `http://${request.headers.host ?? 'localhost:4000'}`;
			const url = new URL(request.url, baseURL);
			const headers = toWebHeaders(request.headers);
			const hasBody =
				request.method !== 'GET' && request.method !== 'HEAD' && request.body !== undefined;

			if (hasBody) {
				headers.set('content-type', headers.get('content-type') ?? 'application/json');
			}

			const authResponse = await auth.handler(
				new Request(url.toString(), {
					method: request.method,
					headers,
					body: hasBody ? JSON.stringify(request.body) : undefined,
				})
			);

			copyWebResponseHeaders(authResponse, reply);
			reply.status(authResponse.status);
			return reply.send(await authResponse.text());
		});

		const port = Number(process.env.PORT) || 4000;
		const host = process.env.HOST || '0.0.0.0';

		await fastify.listen({ port, host });
		fastify.log.info(`Servidor rodando em http://${host}:${port}`);
	} catch (err) {
		fastify.log.error(err);
		process.exit(1);
	}
};

const gracefulShutdown = async () => {
	await fastify.close();
	process.exit(0);
};

process.on('SIGTERM', gracefulShutdown);
process.on('SIGINT', gracefulShutdown);

startServer();

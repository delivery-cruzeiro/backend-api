import Fastify from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import multipart from '@fastify/multipart';
import rateLimit from '@fastify/rate-limit';
import dotenv from 'dotenv';
import { isAllowedOrigin } from './security/config.js';
import { registerSecurityHooks } from './security/http.js';
import { assertDatabaseSecurity } from './lib/prisma.js';
import { orderEventsEmitter } from './events/order-events.emitter.js';
import { SocketGateway } from './gateways/socket.gateway.js';
import { appConfigRoutes } from './routes/app-config.routes.js';
import { authRoutes } from './routes/auth.routes.js';
import { badgeRoutes } from './routes/badge.routes.js';
import { categoryRoutes } from './routes/category.routes.js';
import { carouselRoutes } from './routes/carousel.routes.js';
import { clientRoutes } from './routes/client.routes.js';
import { cupPollNewMatchRoutes, cupPollRoutes } from './routes/cup-poll.routes.js';
import { menuRoutes } from './routes/menu.routes.js';
import { invoiceRoutes } from './routes/invoice.routes.js';
import { orderRoutes } from './routes/order.routes.js';
import { productRoutes } from './routes/product.routes.js';
import { printerConfigurationRoutes } from './routes/printer-configuration.routes.js';
import { promotionRoutes } from './routes/promotion.routes.js';
import { storeShippingRoutes } from './routes/store-shipping.routes.js';
import { storeRoutes } from './routes/store.routes.js';
import { storePaymentMethodRoutes } from './routes/store-payment-method.routes.js';
import { subcategoryRoutes } from './routes/subcategory.routes.js';
import { userGroupRoutes } from './routes/user-group.routes.js';
import { userRoutes } from './routes/user.routes.js';
import { whatsappRoutes } from './routes/whatsapp.routes.js';
import { ensureDefaultAdminInvariant } from './services/admin-invariant.service.js';
import { OrderWhatsAppAutomationService } from './services/order-whatsapp-automation.service.js';

dotenv.config();

const fastify = Fastify({
	trustProxy: (_address, hop) => hop === 0,
	bodyLimit: 1024 * 1024,
	requestTimeout: 30000,
	connectionTimeout: 10000,
	ajv: { customOptions: { removeAdditional: false } },
	logger: {
		level: process.env.LOG_LEVEL || 'info',
		redact: ['req.headers.authorization', 'req.headers.cookie', 'res.headers["set-cookie"]', '*.password', '*.token', '*.secret'],
		serializers: { req: (req: {method: string; url: string}) => ({method:req.method, url:req.url.split('?')[0]}) },
	},
});
const orderWhatsAppAutomationService = new OrderWhatsAppAutomationService(
	undefined,
	undefined,
	undefined,
	fastify.log
);

const startServer = async () => {
	try {
		await assertDatabaseSecurity();
		registerSecurityHooks(fastify);
		await fastify.register(cors, {
            methods: ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
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
				files: 20,
			},
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
		const unsubscribeWhatsAppAutomation = orderEventsEmitter.onOrderChanged(event => {
			orderWhatsAppAutomationService.enqueueTransition({
				nextStatus: event.status,
				orderId: event.order.id,
				previousStatus: event.previousStatus,
			});
		});

		fastify.addHook('onClose', async () => {
			unsubscribeWhatsAppAutomation();
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
		await fastify.register(badgeRoutes, { prefix: '/api' });
		await fastify.register(appConfigRoutes, { prefix: '/api' });
		await fastify.register(categoryRoutes, { prefix: '/api' });
		await fastify.register(carouselRoutes, { prefix: '/api' });
		await fastify.register(clientRoutes, { prefix: '/api' });
		await fastify.register(cupPollRoutes, { prefix: '/api' });
		await fastify.register(cupPollNewMatchRoutes);
		await fastify.register(invoiceRoutes, { prefix: '/api' });
		await fastify.register(menuRoutes, { prefix: '/api' });
		await fastify.register(orderRoutes, { prefix: '/api' });
		await fastify.register(productRoutes, { prefix: '/api' });
		await fastify.register(printerConfigurationRoutes, { prefix: '/api' });
		await fastify.register(promotionRoutes, { prefix: '/api' });
		await fastify.register(storeShippingRoutes, { prefix: '/api' });
		await fastify.register(storeRoutes, { prefix: '/api' });
		await fastify.register(storePaymentMethodRoutes, { prefix: '/api' });
		await fastify.register(subcategoryRoutes, { prefix: '/api' });
		await fastify.register(userGroupRoutes, { prefix: '/api' });
		await fastify.register(userRoutes, { prefix: '/api' });
		await fastify.register(whatsappRoutes, { prefix: '/api' });
		await ensureDefaultAdminInvariant();

		fastify.all('/api/auth/*', async (_request, reply) => {
			return reply.code(404).send({error:'Rota nao encontrada'});
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

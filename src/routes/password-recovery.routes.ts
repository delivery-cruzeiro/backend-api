import type { FastifyInstance, RouteHandlerMethod } from 'fastify';
import {
	requestPasswordRecoverySchema,
	verifyPasswordRecoverySchema,
	resetRecoveredPasswordSchema,
} from '@delivery-cruzeiro/types';
import { createPasswordRecoveryController } from '../controllers/password-recovery.controller.js';
import { validateZod } from '../middleware/validate-zod.middleware.js';
import { limitPasswordRecovery } from '../security/password-recovery-limit.js';
import { PasswordRecoveryRepository } from '../repositories/password-recovery.repository.js';
import { PasswordRecoveryService } from '../services/password-recovery.service.js';

export async function passwordRecoveryRoutes(app: FastifyInstance) {
	const service = new PasswordRecoveryService();
	const controller = createPasswordRecoveryController(service);
	const email = { type: 'string', format: 'email', maxLength: 254 };
	for (const [path, handler, validation, extra] of [
		['request', controller.request, requestPasswordRecoverySchema, {}],
		[
			'verify',
			controller.verify,
			verifyPasswordRecoverySchema,
			{ code: { type: 'string', pattern: '^\\d{6}$' } },
		],
		[
			'reset',
			controller.reset,
			resetRecoveredPasswordSchema,
			{
				recoveryAuthorization: { type: 'string', pattern: '^[a-f0-9]{64}$' },
				password: { type: 'string', minLength: 8, maxLength: 128 },
				confirmPassword: { type: 'string', minLength: 8, maxLength: 128 },
			},
		],
	] as const) {
		app.post(
			`/auth/password-recovery/${path}`,
			{
				preValidation: [validateZod(validation), limitPasswordRecovery],
				config: { rateLimit: { max: 30, timeWindow: '15 minutes' } },
				schema: {
					tags: ['Autenticação'],
					body: {
						type: 'object',
						additionalProperties: false,
						required: ['email', ...Object.keys(extra)],
						properties: { email, ...extra },
					},
				},
			},
			handler as RouteHandlerMethod
		);
	}
	const repository = new PasswordRecoveryRepository();
	const cleanup = () =>
		repository.cleanup().catch(() => app.log.error('Password recovery cleanup failed'));
	let timer: ReturnType<typeof setInterval>;
	app.addHook('onReady', async () => {
		await cleanup();
		timer = setInterval(() => {
			void cleanup();
		}, 60000);
		timer.unref();
	});
	app.addHook('onClose', async () => {
		clearInterval(timer);
		await service.waitForDeliveries();
	});
}

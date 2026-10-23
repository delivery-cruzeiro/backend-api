import type { FastifyInstance } from 'fastify';
import { requireSuperAdmin, type AuthenticatedRequest } from '../middleware/auth.middleware.js';
import {
	DeploymentError,
	DeploymentReleaseService,
} from '../services/deployment-release.service.js';

export async function deploymentReleaseRoutes(app: FastifyInstance) {
	const service = new DeploymentReleaseService();
	app.addHook('onRequest', requireSuperAdmin);
	app.addHook('onRequest', async (_request, reply) => {
		reply.header('Cache-Control', 'no-store');
	});
	app.get('/deployment/releases', async (_request, reply) => {
		try {
			return await service.list();
		} catch (error) {
			if (error instanceof DeploymentError)
				return reply.code(error.statusCode).send({ error: error.message });
			throw error;
		}
	});
	app.post<{ Body: { version: string; revision: string } }>(
		'/deployment/releases/select',
		{
			config: { rateLimit: { max: 3, timeWindow: '1 minute' } },
			schema: {
				body: {
					type: 'object',
					additionalProperties: false,
					required: ['version', 'revision'],
					properties: {
						version: {
							type: 'string',
							pattern: '^v(0|[1-9][0-9]*)\\.(0|[1-9][0-9]*)\\.(0|[1-9][0-9]*)$',
							maxLength: 40,
						},
						revision: { type: 'string', pattern: '^[a-f0-9]{40}$' },
					},
				},
			},
		},
		async (request, reply) => {
			try {
				const result = await service.select(
					request.body.version,
					request.body.revision,
					(request as AuthenticatedRequest).user!.id
				);
				request.log.info(
					{
						version: result.version,
						commit: result.commit,
						actorId: (request as AuthenticatedRequest).user!.id,
					},
					'Deployment release requested'
				);
				return reply.code(202).send(result);
			} catch (error) {
				if (error instanceof DeploymentError)
					return reply.code(error.statusCode).send({ error: error.message });
				throw error;
			}
		}
	);
}

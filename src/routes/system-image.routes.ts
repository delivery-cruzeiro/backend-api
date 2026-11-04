import type { FastifyInstance } from 'fastify';
import { requireManager } from '../middleware/auth.middleware.js';
import {
	createSystemImage,
	deleteSystemImage,
	listSystemImages,
	synchronizeSystemImages,
	updateSystemImage,
} from '../controllers/system-image.controller.js';

export async function systemImageRoutes(app: FastifyInstance) {
	app.get<{ Querystring: Parameters<typeof listSystemImages>[0]['query'] }>(
		'/system-images',
		{
			preHandler: requireManager,
			schema: {
				querystring: {
					type: 'object',
					additionalProperties: false,
					properties: {
						directory: { type: 'string', maxLength: 200 },
						search: { type: 'string', maxLength: 200 },
						kind: {
							type: 'string',
							enum: ['categorias', 'subcategorias', 'produtos', 'carrossel', 'menus'],
						},
						page: { type: 'integer', minimum: 1, maximum: 100000 },
					},
				},
			},
		},
		listSystemImages
	);
	app.post('/system-images', { preHandler: requireManager }, createSystemImage);
	app.post<{ Body: { cursor?: string } }>(
		'/system-images/sync',
		{
			preHandler: requireManager,
			schema: {
				body: {
					type: 'object',
					additionalProperties: false,
					properties: { cursor: { type: 'string', maxLength: 1000 } },
				},
			},
		},
		synchronizeSystemImages
	);
	app.patch<{ Params: { id: string }; Body: { name?: string; directory?: string } }>(
		'/system-images/:id',
		{
			preHandler: requireManager,
			schema: {
				body: {
					type: 'object',
					additionalProperties: false,
					properties: {
						name: { type: 'string', minLength: 1, maxLength: 200, pattern: '\\S' },
						directory: { type: 'string', minLength: 1, maxLength: 200 },
					},
				},
			},
		},
		updateSystemImage
	);
	app.delete<{ Params: { id: string } }>(
		'/system-images/:id',
		{ preHandler: requireManager },
		deleteSystemImage
	);
}

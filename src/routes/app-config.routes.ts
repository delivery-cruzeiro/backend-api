import type { FastifyInstance } from 'fastify';
import { getAppConfig } from '../controllers/app-config.controller.js';

const moduleFlagsSchema = {
	type: 'object',
	properties: {
		admin: { type: 'boolean' },
		attendance: { type: 'boolean' },
		crm: { type: 'boolean' },
		delivery: { type: 'boolean' },
		fiscal: { type: 'boolean' },
		pdv: { type: 'boolean' },
		promotions: { type: 'boolean' },
	},
	required: ['admin', 'attendance', 'crm', 'delivery', 'fiscal', 'pdv', 'promotions'],
};

export async function appConfigRoutes(fastify: FastifyInstance) {
	fastify.get(
		'/app-config',
		{
			schema: {
				description: 'Retornar configuracao publica de marca, tema e modulos',
				tags: ['Configuracao'],
				response: {
					200: {
						type: 'object',
						properties: {
							assets: {
								type: 'object',
								properties: {
									faviconUrl: { type: 'string' },
									logoAlt: { type: 'string' },
									logoUrl: { type: 'string' },
								},
								required: ['logoAlt'],
							},
							brandName: { type: 'string' },
							companyName: { type: 'string' },
							i18n: {
								type: 'object',
								properties: {
									defaultLocale: { type: 'string' },
									overrides: { type: 'object' },
								},
								required: ['defaultLocale', 'overrides'],
							},
							modules: moduleFlagsSchema,
							publicName: { type: 'string' },
							theme: {
								type: 'object',
								properties: {
									name: { type: 'string' },
									tokens: { type: 'object' },
								},
								required: ['name', 'tokens'],
							},
						},
						required: [
							'assets',
							'brandName',
							'companyName',
							'i18n',
							'modules',
							'publicName',
							'theme',
						],
					},
				},
			},
		},
		getAppConfig
	);
}

import type { FastifyReply, FastifyRequest } from 'fastify';
import { AppConfigService } from '../services/app-config.service.js';

const appConfigService = new AppConfigService();

export const getAppConfig = async (_request: FastifyRequest, reply: FastifyReply) => {
	try {
		return reply.send(appConfigService.getPublicConfig());
	} catch (error) {
		console.error('Erro ao buscar configuracao da aplicacao:', error);

		return reply.status(500).send({
			error: 'Erro interno do servidor',
		});
	}
};

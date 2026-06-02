import type { FastifyReply, FastifyRequest } from 'fastify';
import { StoreService } from '../services/store.service.js';

const storeService = new StoreService();

export const getStores = async (_request: FastifyRequest, reply: FastifyReply) => {
	try {
		const stores = await storeService.listActiveStores();

		return reply.send({
			stores,
			total: stores.length,
		});
	} catch (error) {
		console.error('Erro ao buscar lojas:', error);
		return reply.status(500).send({
			error: 'Erro interno do servidor',
		});
	}
};

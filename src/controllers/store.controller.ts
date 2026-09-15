import type { FastifyReply, FastifyRequest } from 'fastify';
import {
	StoreService,
	systemLayouts,
	type SystemLayoutValue,
} from '../services/store.service.js';

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

type UpdateStoreLayoutRequest = FastifyRequest<{
	Body: { layout?: string };
	Params: { id: string };
}>;

export const updateStoreLayout = async (
	request: UpdateStoreLayoutRequest,
	reply: FastifyReply
) => {
	const { id } = request.params;
	const { layout } = request.body ?? {};

	if (!layout || !systemLayouts.includes(layout as SystemLayoutValue)) {
		return reply.status(400).send({ error: 'Layout de sistema invalido' });
	}

	try {
		const store = await storeService.updateLayout(id, layout as SystemLayoutValue);

		return reply.send({
			message: 'Layout do sistema atualizado com sucesso',
			store,
		});
	} catch (error) {
		if (error instanceof Error && error.message === 'STORE_NOT_FOUND') {
			return reply.status(404).send({ error: 'Loja nao encontrada' });
		}

		console.error('Erro ao atualizar layout da loja:', error);
		return reply.status(500).send({ error: 'Erro interno do servidor' });
	}
};

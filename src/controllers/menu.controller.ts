import {
	createMenuSchema,
	formatZodError,
	updateMenuSchema,
	type MenuDTO,
	type UpdateMenuDTO,
} from '@delivery-cruzeiro/types';
import type { FastifyReply, FastifyRequest } from 'fastify';
import {
	appendMultipartField,
	normalizeBaseCatalogInput,
	parseStringArrayField,
	type CatalogImageFile,
	type MultipartRequest,
} from './catalog-request.utils.js';
import { getStoreIdQuery } from '../services/catalog-store.utils.js';
import { MenuService } from '../services/menu.service.js';

const menuService = new MenuService();

function normalizeMenuInput(fields: Record<string, unknown>) {
	return {
		...normalizeBaseCatalogInput(fields),
		...(fields.categoryIds !== undefined && {
			categoryIds: parseStringArrayField(fields.categoryIds),
		}),
		...(fields.subcategoryIds !== undefined && {
			subcategoryIds: parseStringArrayField(fields.subcategoryIds),
		}),
	};
}

async function readMultipartMenu(request: MultipartRequest) {
	const fields: Record<string, unknown> = {};
	let image: CatalogImageFile | null = null;

	for await (const part of request.parts()) {
		if (part.type === 'field') {
			appendMultipartField(fields, part.fieldname, part.value);
			continue;
		}

		if (part.fieldname !== 'image') {
			throw new Error('Campo de arquivo invalido');
		}

		if (image) {
			throw new Error('Envie apenas uma imagem');
		}

		image = {
			buffer: await part.toBuffer(),
			filename: part.filename,
			mimetype: part.mimetype,
		};
	}

	return {
		image,
		input: normalizeMenuInput(fields),
	};
}

async function readMenuRequest(request: FastifyRequest<{ Body: MenuDTO }>) {
	const multipartRequest = request as MultipartRequest;

	if (multipartRequest.isMultipart()) {
		return readMultipartMenu(multipartRequest);
	}

	return {
		image: null,
		input: normalizeMenuInput((request.body ?? {}) as Record<string, unknown>),
	};
}

function getErrorStatus(message: string) {
	if (message.includes('nao encontrada') || message.includes('nao encontrado')) {
		return 404;
	}

	if (message.includes('ja cadastrado')) {
		return 409;
	}

	if (message.includes('Selecione')) {
		return 400;
	}

	return 500;
}

export const getMenus = async (
	request: FastifyRequest<{ Querystring: { storeId?: string } }>,
	reply: FastifyReply
) => {
	try {
		const menus = await menuService.listMenus(getStoreIdQuery(request.query));

		return reply.send({
			menus,
			total: menus.length,
		});
	} catch (error) {
		console.error('Erro ao buscar menus:', error);
		return reply.status(500).send({ error: 'Erro interno do servidor' });
	}
};

export const createMenu = async (
	request: FastifyRequest<{ Body: MenuDTO }>,
	reply: FastifyReply
) => {
	try {
		const { image, input } = await readMenuRequest(request);
		const validation = createMenuSchema.safeParse(input);

		if (!validation.success) {
			const error = formatZodError(validation.error);

			return reply.status(error.statusCode ?? 400).send({
				error: error.message,
				code: error.code,
				details: error.details,
			});
		}

		const menu = await menuService.createMenu(validation.data, image);

		return reply.status(201).send({
			message: 'Menu criado com sucesso',
			menu,
		});
	} catch (error) {
		const message = error instanceof Error ? error.message : 'Erro interno do servidor';

		console.error('Erro ao criar menu:', error);
		return reply.status(getErrorStatus(message)).send({ error: message });
	}
};

export const deleteMenu = async (
	request: FastifyRequest<{ Params: { id: string } }>,
	reply: FastifyReply
) => {
	try {
		await menuService.deleteMenu(request.params.id);

		return reply.send({ message: 'Menu deletado com sucesso' });
	} catch (error) {
		const message = error instanceof Error ? error.message : 'Erro interno do servidor';

		console.error('Erro ao deletar menu:', error);
		return reply.status(getErrorStatus(message)).send({ error: message });
	}
};

export const updateMenu = async (
	request: FastifyRequest<{ Body: UpdateMenuDTO; Params: { id: string } }>,
	reply: FastifyReply
) => {
	try {
		const { image, input } = await readMenuRequest(
			request as FastifyRequest<{ Body: MenuDTO }>
		);
		const validation = updateMenuSchema.safeParse(input);

		if (!validation.success) {
			const error = formatZodError(validation.error);

			return reply.status(error.statusCode ?? 400).send({
				error: error.message,
				code: error.code,
				details: error.details,
			});
		}

		const menu = await menuService.updateMenu(request.params.id, validation.data, image);

		return reply.send({
			message: 'Menu atualizado com sucesso',
			menu,
		});
	} catch (error) {
		const message = error instanceof Error ? error.message : 'Erro interno do servidor';

		console.error('Erro ao atualizar menu:', error);
		return reply.status(getErrorStatus(message)).send({ error: message });
	}
};

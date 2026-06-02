import {
	createSubcategorySchema,
	formatZodError,
	updateSubcategorySchema,
	type SubcategoryDTO,
	type UpdateSubcategoryDTO,
} from '@delivery-cruzeiro/types';
import type { FastifyReply, FastifyRequest } from 'fastify';
import {
	appendMultipartField,
	normalizeBaseCatalogInput,
	type CatalogImageFile,
	type MultipartRequest,
} from './catalog-request.utils.js';
import { getStoreIdQuery } from '../services/catalog-store.utils.js';
import { SubcategoryService } from '../services/subcategory.service.js';

const subcategoryService = new SubcategoryService();

function normalizeSubcategoryInput(fields: Record<string, unknown>) {
	return {
		...normalizeBaseCatalogInput(fields),
		...(fields.categoryId !== undefined && { categoryId: fields.categoryId }),
	};
}

async function readMultipartSubcategory(request: MultipartRequest) {
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
		input: normalizeSubcategoryInput(fields),
	};
}

async function readSubcategoryRequest(request: FastifyRequest<{ Body: SubcategoryDTO }>) {
	const multipartRequest = request as MultipartRequest;

	if (multipartRequest.isMultipart()) {
		return readMultipartSubcategory(multipartRequest);
	}

	return {
		image: null,
		input: normalizeSubcategoryInput((request.body ?? {}) as Record<string, unknown>),
	};
}

function getErrorStatus(message: string) {
	if (message.includes('nao encontrada') || message.includes('nao encontrado')) {
		return 404;
	}

	if (message.includes('ja cadastrada') || message.includes('ja cadastrado')) {
		return 409;
	}

	if (message.includes('Selecione')) {
		return 400;
	}

	return 500;
}

export const getSubcategories = async (
	request: FastifyRequest<{ Querystring: { storeId?: string } }>,
	reply: FastifyReply
) => {
	try {
		const subcategories = await subcategoryService.listSubcategories(
			getStoreIdQuery(request.query)
		);

		return reply.send({
			subcategories,
			total: subcategories.length,
		});
	} catch (error) {
		console.error('Erro ao buscar subcategorias:', error);
		return reply.status(500).send({ error: 'Erro interno do servidor' });
	}
};

export const createSubcategory = async (
	request: FastifyRequest<{ Body: SubcategoryDTO }>,
	reply: FastifyReply
) => {
	try {
		const { image, input } = await readSubcategoryRequest(request);
		const validation = createSubcategorySchema.safeParse(input);

		if (!validation.success) {
			const error = formatZodError(validation.error);

			return reply.status(error.statusCode ?? 400).send({
				error: error.message,
				code: error.code,
				details: error.details,
			});
		}

		const subcategory = await subcategoryService.createSubcategory(validation.data, image);

		return reply.status(201).send({
			message: 'Subcategoria criada com sucesso',
			subcategory,
		});
	} catch (error) {
		const message = error instanceof Error ? error.message : 'Erro interno do servidor';

		console.error('Erro ao criar subcategoria:', error);
		return reply.status(getErrorStatus(message)).send({ error: message });
	}
};

export const deleteSubcategory = async (
	request: FastifyRequest<{ Params: { id: string } }>,
	reply: FastifyReply
) => {
	try {
		await subcategoryService.deleteSubcategory(request.params.id);

		return reply.send({ message: 'Subcategoria deletada com sucesso' });
	} catch (error) {
		const message = error instanceof Error ? error.message : 'Erro interno do servidor';

		console.error('Erro ao deletar subcategoria:', error);
		return reply.status(getErrorStatus(message)).send({ error: message });
	}
};

export const updateSubcategory = async (
	request: FastifyRequest<{ Body: UpdateSubcategoryDTO; Params: { id: string } }>,
	reply: FastifyReply
) => {
	try {
		const { image, input } = await readSubcategoryRequest(
			request as FastifyRequest<{ Body: SubcategoryDTO }>
		);
		const validation = updateSubcategorySchema.safeParse(input);

		if (!validation.success) {
			const error = formatZodError(validation.error);

			return reply.status(error.statusCode ?? 400).send({
				error: error.message,
				code: error.code,
				details: error.details,
			});
		}

		const subcategory = await subcategoryService.updateSubcategory(
			request.params.id,
			validation.data,
			image
		);

		return reply.send({
			message: 'Subcategoria atualizada com sucesso',
			subcategory,
		});
	} catch (error) {
		const message = error instanceof Error ? error.message : 'Erro interno do servidor';

		console.error('Erro ao atualizar subcategoria:', error);
		return reply.status(getErrorStatus(message)).send({ error: message });
	}
};

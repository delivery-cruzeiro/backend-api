import {
	createCategorySchema,
	formatZodError,
	updateCategorySchema,
	type CategoryDTO,
	type UpdateCategoryDTO,
} from '@delivery-cruzeiro/types';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { prisma } from '../lib/prisma.js';
import {
	buildStoreConnect,
	buildStoreFilter,
	buildStoreSet,
	ensureActiveStoresExist,
	getStoreIdQuery,
	getStoreValidationStatus,
	storeSummaryListArgs,
} from '../services/catalog-store.utils.js';
import { uploadImage } from '../services/image-upload.service.js';
import { appendMultipartField, parseStringArrayField } from './catalog-request.utils.js';

const categorySelect = {
	id: true,
	name: true,
	description: true,
	imageUrl: true,
	order: true,
	isActive: true,
	createdAt: true,
	updatedAt: true,
	stores: storeSummaryListArgs,
};

type MultipartRequest = FastifyRequest & {
	isMultipart(): boolean;
	parts(): AsyncIterable<
		| {
				fieldname: string;
				filename: string;
				mimetype: string;
				toBuffer(): Promise<Buffer>;
				type: 'file';
		  }
		| {
				fieldname: string;
				type: 'field';
				value: unknown;
		  }
	>;
};

type CategoryImageFile = {
	buffer: Buffer;
	filename: string;
	mimetype: string;
};

function parseBooleanField(value: unknown) {
	if (typeof value === 'boolean') {
		return value;
	}

	if (typeof value !== 'string') {
		return undefined;
	}

	return value === 'true' || value === 'on' || value === '1';
}

function parseNumberField(value: unknown) {
	if (typeof value === 'number') {
		return value;
	}

	if (typeof value !== 'string' || value.trim() === '') {
		return undefined;
	}

	return Number(value);
}

function normalizeCategoryInput(fields: Record<string, unknown>) {
	return {
		...(typeof fields.description === 'string' &&
			fields.description.trim() && { description: fields.description }),
		...(typeof fields.imageUrl === 'string' &&
			fields.imageUrl.trim() && { imageUrl: fields.imageUrl }),
		...(fields.isActive !== undefined && { isActive: parseBooleanField(fields.isActive) }),
		...(fields.name !== undefined && { name: fields.name }),
		...(fields.order !== undefined && { order: parseNumberField(fields.order) }),
		...(fields.storeIds !== undefined && {
			storeIds: parseStringArrayField(fields.storeIds),
		}),
	};
}

async function readMultipartCategory(request: MultipartRequest) {
	const fields: Record<string, unknown> = {};
	let image: CategoryImageFile | null = null;

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
		input: normalizeCategoryInput(fields),
	};
}

async function readCategoryRequest(request: FastifyRequest<{ Body: CategoryDTO }>) {
	const multipartRequest = request as MultipartRequest;

	if (multipartRequest.isMultipart()) {
		return readMultipartCategory(multipartRequest);
	}

	return {
		image: null,
		input: normalizeCategoryInput((request.body ?? {}) as Record<string, unknown>),
	};
}

export const getCategories = async (
	request: FastifyRequest<{ Querystring: { storeId?: string } }>,
	reply: FastifyReply
) => {
	try {
		const storeId = getStoreIdQuery(request.query);
		const categories = await prisma.category.findMany({
			where: buildStoreFilter(storeId),
			select: categorySelect,
			orderBy: [{ order: 'asc' }, { name: 'asc' }],
		});

		return reply.send({
			categories,
			total: categories.length,
		});
	} catch (error) {
		console.error('Erro ao buscar categorias:', error);
		return reply.status(500).send({
			error: 'Erro interno do servidor',
		});
	}
};

export const createCategory = async (
	request: FastifyRequest<{ Body: CategoryDTO }>,
	reply: FastifyReply
) => {
	try {
		const { image, input } = await readCategoryRequest(request);
		const validation = createCategorySchema.safeParse(input);

		if (!validation.success) {
			const error = formatZodError(validation.error);

			return reply.status(error.statusCode ?? 400).send({
				error: error.message,
				code: error.code,
				details: error.details,
			});
		}

		const { description, isActive = true, name, order = 0, storeIds } = validation.data;

		try {
			await ensureActiveStoresExist(storeIds);
		} catch (storeError) {
			const message =
				storeError instanceof Error ? storeError.message : 'Erro interno do servidor';

			return reply.status(getStoreValidationStatus(message)).send({ error: message });
		}

		const existingCategory = await prisma.category.findUnique({
			where: { name },
		});

		if (existingCategory) {
			return reply.status(409).send({
				error: 'Categoria ja cadastrada',
			});
		}

		const imageUrl = image
			? await uploadImage({
					buffer: image.buffer,
					filename: image.filename,
					folder: 'delivery-cruzeiro/categories',
					mimetype: image.mimetype,
				})
			: validation.data.imageUrl;

		const category = await prisma.category.create({
			data: {
				name,
				description,
				imageUrl,
				order,
				isActive,
				stores: buildStoreConnect(storeIds),
			},
			select: categorySelect,
		});

		return reply.status(201).send({
			message: 'Categoria criada com sucesso',
			category,
		});
	} catch (error) {
		console.error('Erro ao criar categoria:', error);
		return reply.status(500).send({
			error: 'Erro interno do servidor',
		});
	}
};

export const deleteCategory = async (
	request: FastifyRequest<{ Params: { id: string } }>,
	reply: FastifyReply
) => {
	try {
		const { id } = request.params;

		const existingCategory = await prisma.category.findUnique({
			where: { id },
			select: {
				id: true,
			},
		});

		if (!existingCategory) {
			return reply.status(404).send({
				error: 'Categoria nao encontrada',
			});
		}

		await prisma.category.delete({
			where: { id },
		});

		return reply.send({
			message: 'Categoria deletada com sucesso',
		});
	} catch (error) {
		console.error('Erro ao deletar categoria:', error);
		return reply.status(500).send({
			error: 'Erro interno do servidor',
		});
	}
};

export const updateCategory = async (
	request: FastifyRequest<{ Body: UpdateCategoryDTO; Params: { id: string } }>,
	reply: FastifyReply
) => {
	try {
		const { id } = request.params;
		const { image, input } = await readCategoryRequest(
			request as FastifyRequest<{ Body: CategoryDTO }>
		);
		const validation = updateCategorySchema.safeParse(input);

		if (!validation.success) {
			const error = formatZodError(validation.error);

			return reply.status(error.statusCode ?? 400).send({
				error: error.message,
				code: error.code,
				details: error.details,
			});
		}

		const existingCategory = await prisma.category.findUnique({
			where: { id },
			select: { id: true },
		});

		if (!existingCategory) {
			return reply.status(404).send({
				error: 'Categoria nao encontrada',
			});
		}

		if (validation.data.name) {
			const categoryWithSameName = await prisma.category.findUnique({
				where: { name: validation.data.name },
				select: { id: true },
			});

			if (categoryWithSameName && categoryWithSameName.id !== id) {
				return reply.status(409).send({
					error: 'Categoria ja cadastrada',
				});
			}
		}

		if (validation.data.storeIds !== undefined) {
			try {
				await ensureActiveStoresExist(validation.data.storeIds);
			} catch (storeError) {
				const message =
					storeError instanceof Error ? storeError.message : 'Erro interno do servidor';

				return reply.status(getStoreValidationStatus(message)).send({ error: message });
			}
		}

		const imageUrl = image
			? await uploadImage({
					buffer: image.buffer,
					filename: image.filename,
					folder: 'delivery-cruzeiro/categories',
					mimetype: image.mimetype,
				})
			: validation.data.imageUrl;
		const { storeIds, ...categoryData } = validation.data;

		const category = await prisma.category.update({
			where: { id },
			data: {
				...categoryData,
				stores: buildStoreSet(storeIds),
				...(imageUrl && { imageUrl }),
			},
			select: categorySelect,
		});

		return reply.send({
			message: 'Categoria atualizada com sucesso',
			category,
		});
	} catch (error) {
		console.error('Erro ao atualizar categoria:', error);
		return reply.status(500).send({
			error: 'Erro interno do servidor',
		});
	}
};

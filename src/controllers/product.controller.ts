import {
	createProductSchema,
	formatZodError,
	updateProductSchema,
	type ProductDTO,
	type UpdateProductDTO,
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

const productSelect = {
	id: true,
	categoryId: true,
	category: {
		select: {
			id: true,
			name: true,
		},
	},
	subcategoryId: true,
	subcategory: {
		select: {
			id: true,
			name: true,
		},
	},
	name: true,
	description: true,
	price: true,
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

type ProductImageFile = {
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

function normalizeProductInput(fields: Record<string, unknown>) {
	return {
		...(fields.categoryId !== undefined && { categoryId: fields.categoryId }),
		...(fields.subcategoryId !== undefined && {
			subcategoryId: fields.subcategoryId || null,
		}),
		...(fields.description !== undefined && { description: fields.description }),
		...(typeof fields.imageUrl === 'string' &&
			fields.imageUrl.trim() && { imageUrl: fields.imageUrl }),
		...(fields.isActive !== undefined && { isActive: parseBooleanField(fields.isActive) }),
		...(fields.name !== undefined && { name: fields.name }),
		...(fields.order !== undefined && { order: parseNumberField(fields.order) }),
		...(fields.price !== undefined && { price: parseNumberField(fields.price) }),
		...(fields.storeIds !== undefined && {
			storeIds: parseStringArrayField(fields.storeIds),
		}),
	};
}

async function readMultipartProduct(request: MultipartRequest) {
	const fields: Record<string, unknown> = {};
	let image: ProductImageFile | null = null;

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
		input: normalizeProductInput(fields),
	};
}

async function readProductRequest(request: FastifyRequest<{ Body: ProductDTO }>) {
	const multipartRequest = request as MultipartRequest;

	if (multipartRequest.isMultipart()) {
		return readMultipartProduct(multipartRequest);
	}

	return {
		image: null,
		input: normalizeProductInput((request.body ?? {}) as Record<string, unknown>),
	};
}

function serializeProduct(product: Awaited<ReturnType<typeof prisma.product.create>>) {
	return {
		...product,
		price: Number(product.price),
	};
}

export const getProducts = async (
	request: FastifyRequest<{ Querystring: { storeId?: string } }>,
	reply: FastifyReply
) => {
	try {
		const storeId = getStoreIdQuery(request.query);
		const products = await prisma.product.findMany({
			where: buildStoreFilter(storeId),
			select: productSelect,
			orderBy: [{ order: 'asc' }, { name: 'asc' }],
		});

		return reply.send({
			products: products.map(product => serializeProduct(product)),
			total: products.length,
		});
	} catch (error) {
		console.error('Erro ao buscar produtos:', error);
		return reply.status(500).send({
			error: 'Erro interno do servidor',
		});
	}
};

export const createProduct = async (
	request: FastifyRequest<{ Body: ProductDTO }>,
	reply: FastifyReply
) => {
	try {
		const { image, input } = await readProductRequest(request);
		const validation = createProductSchema.safeParse(input);

		if (!validation.success) {
			const error = formatZodError(validation.error);

			return reply.status(error.statusCode ?? 400).send({
				error: error.message,
				code: error.code,
				details: error.details,
			});
		}

		const {
			categoryId,
			description,
			isActive = true,
			name,
			order = 0,
			price,
			storeIds,
			subcategoryId,
		} = validation.data;

		try {
			await ensureActiveStoresExist(storeIds);
		} catch (storeError) {
			const message =
				storeError instanceof Error ? storeError.message : 'Erro interno do servidor';

			return reply.status(getStoreValidationStatus(message)).send({ error: message });
		}

		const category = await prisma.category.findUnique({
			where: { id: categoryId },
			select: { id: true },
		});

		if (!category) {
			return reply.status(404).send({
				error: 'Categoria nao encontrada',
			});
		}

		if (subcategoryId) {
			const subcategory = await prisma.subcategory.findUnique({
				where: { id: subcategoryId },
				select: { categoryId: true },
			});

			if (!subcategory || subcategory.categoryId !== categoryId) {
				return reply.status(404).send({
					error: 'Subcategoria nao encontrada para esta categoria',
				});
			}
		}

		const imageUrl = image
			? await uploadImage({
					buffer: image.buffer,
					filename: image.filename,
					folder: 'delivery-cruzeiro/products',
					mimetype: image.mimetype,
				})
			: validation.data.imageUrl;

		const product = await prisma.product.create({
			data: {
				categoryId,
				description,
				imageUrl,
				isActive,
				name,
				order,
				price,
				subcategoryId,
				stores: buildStoreConnect(storeIds),
			},
			select: productSelect,
		});

		return reply.status(201).send({
			message: 'Produto criado com sucesso',
			product: serializeProduct(product),
		});
	} catch (error) {
		console.error('Erro ao criar produto:', error);
		return reply.status(500).send({
			error: 'Erro interno do servidor',
		});
	}
};

export const updateProduct = async (
	request: FastifyRequest<{ Body: UpdateProductDTO; Params: { id: string } }>,
	reply: FastifyReply
) => {
	try {
		const { id } = request.params;
		const { image, input } = await readProductRequest(
			request as FastifyRequest<{ Body: ProductDTO }>
		);
		const validation = updateProductSchema.safeParse(input);

		if (!validation.success) {
			const error = formatZodError(validation.error);

			return reply.status(error.statusCode ?? 400).send({
				error: error.message,
				code: error.code,
				details: error.details,
			});
		}

		const existingProduct = await prisma.product.findUnique({
			where: { id },
			select: { categoryId: true, id: true },
		});

		if (!existingProduct) {
			return reply.status(404).send({
				error: 'Produto nao encontrado',
			});
		}

		if (validation.data.categoryId) {
			const category = await prisma.category.findUnique({
				where: { id: validation.data.categoryId },
				select: { id: true },
			});

			if (!category) {
				return reply.status(404).send({
					error: 'Categoria nao encontrada',
				});
			}
		}

		const nextCategoryId = validation.data.categoryId ?? existingProduct.categoryId;

		if (validation.data.subcategoryId) {
			const subcategory = await prisma.subcategory.findUnique({
				where: { id: validation.data.subcategoryId },
				select: { categoryId: true },
			});

			if (!subcategory || subcategory.categoryId !== nextCategoryId) {
				return reply.status(404).send({
					error: 'Subcategoria nao encontrada para esta categoria',
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
					folder: 'delivery-cruzeiro/products',
					mimetype: image.mimetype,
				})
			: validation.data.imageUrl;
		const { storeIds, ...productData } = validation.data;

		const product = await prisma.product.update({
			where: { id },
			data: {
				...productData,
				...(productData.categoryId &&
					productData.subcategoryId === undefined && { subcategoryId: null }),
				stores: buildStoreSet(storeIds),
				...(imageUrl && { imageUrl }),
			},
			select: productSelect,
		});

		return reply.send({
			message: 'Produto atualizado com sucesso',
			product: serializeProduct(product),
		});
	} catch (error) {
		console.error('Erro ao atualizar produto:', error);
		return reply.status(500).send({
			error: 'Erro interno do servidor',
		});
	}
};

export const deleteProduct = async (
	request: FastifyRequest<{ Params: { id: string } }>,
	reply: FastifyReply
) => {
	try {
		const { id } = request.params;
		const existingProduct = await prisma.product.findUnique({
			where: { id },
			select: { id: true },
		});

		if (!existingProduct) {
			return reply.status(404).send({
				error: 'Produto nao encontrado',
			});
		}

		await prisma.product.delete({
			where: { id },
		});

		return reply.send({
			message: 'Produto deletado com sucesso',
		});
	} catch (error) {
		console.error('Erro ao deletar produto:', error);
		return reply.status(500).send({
			error: 'Erro interno do servidor',
		});
	}
};

type BulkProductUpdateBody = {
	appendDescription?: string;
	appendName?: string;
	categoryId?: string;
	isActive?: boolean;
	mode: 'category' | 'products';
	priceOperation?: 'add' | 'subtract';
	priceValue?: number;
	productIds?: string[];
};

export const bulkUpdateProducts = async (
	request: FastifyRequest<{ Body: BulkProductUpdateBody }>,
	reply: FastifyReply
) => {
	try {
		const {
			appendDescription,
			appendName,
			categoryId,
			isActive,
			mode,
			priceOperation,
			priceValue,
			productIds = [],
		} = request.body;

		const where =
			mode === 'category'
				? { categoryId }
				: {
						id: {
							in: productIds,
						},
					};

		if (mode === 'category' && !categoryId) {
			return reply.status(400).send({ error: 'Categoria obrigatoria' });
		}

		if (mode === 'products' && productIds.length === 0) {
			return reply.status(400).send({ error: 'Selecione ao menos um produto' });
		}

		const products = await prisma.product.findMany({
			where,
			select: {
				id: true,
				description: true,
				name: true,
				price: true,
			},
		});

		if (products.length === 0) {
			return reply.status(404).send({ error: 'Produto nao encontrado' });
		}

		const priceDelta =
			priceValue && priceOperation
				? priceOperation === 'subtract'
					? -Math.abs(priceValue)
					: Math.abs(priceValue)
				: 0;

		if (priceDelta < 0) {
			const invalidProduct = products.find(product => Number(product.price) + priceDelta < 0);

			if (invalidProduct) {
				return reply.status(400).send({
					error: 'Nenhum produto pode ter preco abaixo de 0',
				});
			}
		}

		await prisma.$transaction(
			products.map(product =>
				prisma.product.update({
					where: { id: product.id },
					data: {
						...(appendDescription?.trim() && {
							description: `${product.description} ${appendDescription.trim()}`,
						}),
						...(appendName?.trim() && {
							name: `${product.name} ${appendName.trim()}`,
						}),
						...(isActive !== undefined && { isActive }),
						...(priceDelta !== 0 && { price: Number(product.price) + priceDelta }),
					},
				})
			)
		);

		return reply.send({
			message: 'Produtos atualizados com sucesso',
			updated: products.length,
		});
	} catch (error) {
		console.error('Erro ao atualizar produtos em escala:', error);
		return reply.status(500).send({
			error: 'Erro interno do servidor',
		});
	}
};

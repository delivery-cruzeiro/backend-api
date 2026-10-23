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
import { composeProductAdditionalFields } from '../services/product-additional-fields.service.js';
import { appendMultipartField, parseStringArrayField } from './catalog-request.utils.js';

const productSelect = {
	id: true,
	categoryId: true,
	category: {
		select: {
			additionalFields: true,
			id: true,
			name: true,
		},
	},
	subcategoryId: true,
	subcategory: {
		select: {
			additionalFields: true,
			id: true,
			name: true,
		},
	},
	name: true,
	description: true,
	price: true,
	pricingMode: true,
	imageUrl: true,
	additionalFields: true,
	unavailable: true,
	order: true,
	isActive: true,
	createdAt: true,
	updatedAt: true,
	stores: storeSummaryListArgs,
	badges: {
		select: {
			badge: {
				select: {
					id: true,
					name: true,
					color: true,
					icon: true,
					isActive: true,
					storeId: true,
				},
			},
		},
		orderBy: { createdAt: 'asc' as const },
	},
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

function parseJsonArrayField(value: unknown) {
	if (Array.isArray(value)) {
		return value;
	}

	if (typeof value !== 'string' || value.trim() === '') {
		return undefined;
	}

	try {
		const parsed = JSON.parse(value);

		return Array.isArray(parsed) ? parsed : undefined;
	} catch {
		return undefined;
	}
}

function normalizeProductInput(fields: Record<string, unknown>) {
	return {
		...(fields.badgeIds !== undefined && {
			badgeIds: parseStringArrayField(fields.badgeIds),
		}),
		...(fields.additionalFields !== undefined && {
			additionalFields: parseJsonArrayField(fields.additionalFields),
		}),
		...(fields.categoryId !== undefined && { categoryId: fields.categoryId }),
		...(fields.subcategoryId !== undefined && {
			subcategoryId: fields.subcategoryId || null,
		}),
		...(fields.description !== undefined && { description: fields.description }),
		...(typeof fields.imageUrl === 'string' &&
			fields.imageUrl.trim() && { imageUrl: fields.imageUrl }),
		...(fields.isActive !== undefined && { isActive: parseBooleanField(fields.isActive) }),
		...(fields.unavailable !== undefined && {
			unavailable: parseBooleanField(fields.unavailable),
		}),
		...(fields.name !== undefined && { name: fields.name }),
		...(fields.order !== undefined && { order: parseNumberField(fields.order) }),
		...(fields.price !== undefined && { price: parseNumberField(fields.price) }),
		...(fields.pricingMode !== undefined && { pricingMode: fields.pricingMode }),
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

type ProductWithBadges = {
	additionalFields: unknown;
	badges: Array<{
		badge: {
			color: string;
			icon: string | null;
			id: string;
			isActive: boolean;
			name: string;
			storeId: string;
		};
	}>;
	category: { additionalFields: unknown; id: string; name: string };
	id: string;
	price: unknown;
	pricingMode: string;
	subcategory: { additionalFields: unknown; id: string; name: string } | null;
	[key: string]: unknown;
};

function serializeProduct(product: ProductWithBadges, storeId?: string) {
	const { badges, ...data } = product;
	return {
		...data,
		additionalFields: composeProductAdditionalFields({
			category: product.category,
			product,
			subcategory: product.subcategory,
		}),
		badges: badges
			.map(item => item.badge)
			.filter(badge => !storeId || badge.storeId === storeId),
		price: Number(product.price),
		pricingMode: product.pricingMode,
	};
}

async function ensureBadgesExistForStores(badgeIds: string[], storeIds: string[]) {
	if (badgeIds.length === 0) {
		return;
	}

	const count = await prisma.badge.count({
		where: {
			id: { in: badgeIds },
			storeId: { in: storeIds },
		},
	});

	if (count !== badgeIds.length) {
		throw new Error('Uma ou mais badges nao pertencem as lojas do produto');
	}
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
			products: products.map(product => serializeProduct(product, storeId)),
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
			badgeIds = [],
			categoryId,
			description,
			isActive = true,
			name,
			order = 0,
			price,
			pricingMode,
			storeIds,
			subcategoryId,
			additionalFields = [],
			unavailable = false,
		} = validation.data;
		const uniqueBadgeIds = [...new Set(badgeIds)];

		try {
			await ensureActiveStoresExist(storeIds);
			await ensureBadgesExistForStores(uniqueBadgeIds, storeIds);
		} catch (storeError) {
			const message =
				storeError instanceof Error ? storeError.message : 'Erro interno do servidor';

			return reply
				.status(message.includes('badges') ? 400 : getStoreValidationStatus(message))
				.send({ error: message });
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
				badges: {
					create: uniqueBadgeIds.map(badgeId => ({ badgeId })),
				},
				categoryId,
				description,
				imageUrl,
				additionalFields,
				unavailable,
				isActive,
				name,
				order,
				price,
				pricingMode,
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
			select: {
				categoryId: true,
				id: true,
				stores: { select: { id: true } },
			},
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

		const nextStoreIds =
			validation.data.storeIds ?? existingProduct.stores.map(store => store.id);
		const uniqueBadgeIds = validation.data.badgeIds
			? [...new Set(validation.data.badgeIds)]
			: undefined;

		if (uniqueBadgeIds) {
			try {
				await ensureBadgesExistForStores(uniqueBadgeIds, nextStoreIds);
			} catch (badgeError) {
				return reply.status(400).send({
					error:
						badgeError instanceof Error
							? badgeError.message
							: 'Badges invalidas',
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
		const storeIds = validation.data.storeIds;
		const productData = { ...validation.data };
		delete productData.badgeIds;
		delete productData.storeIds;

		const product = await prisma.product.update({
			where: { id },
			data: {
				...productData,
				...(uniqueBadgeIds && {
					badges: {
						deleteMany: {},
						create: uniqueBadgeIds.map(badgeId => ({ badgeId })),
					},
				}),
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

		await prisma.$transaction(async transaction => Promise.all(
			products.map(product =>
				transaction.product.update({
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
		));

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

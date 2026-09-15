import {
	activateCarouselSchema,
	createCarouselSchema,
	formatZodError,
	updateCarouselSchema,
	type CarouselContentDTO,
} from '@delivery-cruzeiro/types';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { prisma } from '../lib/prisma.js';
import type { AuthenticatedRequest } from '../middleware/auth.middleware.js';
import { uploadImage } from '../services/image-upload.service.js';
import { appendMultipartField, type MultipartRequest } from './catalog-request.utils.js';

const carouselSelect = {
	id: true,
	name: true,
	isActive: true,
	content: true,
	storeId: true,
	createdAt: true,
	updatedAt: true,
	createdBy: { select: { id: true, name: true } },
	lastModifiedBy: { select: { id: true, name: true } },
} as const;

type CarouselImageFile = {
	buffer: Buffer;
	filename: string;
	mimetype: string;
};

type CarouselInput = {
	content?: unknown;
	name?: unknown;
	storeId?: unknown;
};

function parseContent(value: unknown) {
	if (typeof value !== 'string') {
		return value;
	}

	try {
		return JSON.parse(value) as unknown;
	} catch {
		return undefined;
	}
}

function normalizeInput(fields: Record<string, unknown>): CarouselInput {
	return {
		...(fields.content !== undefined && { content: parseContent(fields.content) }),
		...(fields.name !== undefined && { name: fields.name }),
		...(fields.storeId !== undefined && { storeId: fields.storeId }),
	};
}

async function readMultipartCarousel(request: MultipartRequest) {
	const fields: Record<string, unknown> = {};
	const images = new Map<number, CarouselImageFile>();

	for await (const part of request.parts()) {
		if (part.type === 'field') {
			appendMultipartField(fields, part.fieldname, part.value);
			continue;
		}

		const match = /^slideImage_(\d+)$/.exec(part.fieldname);

		if (!match) {
			throw new Error('Campo de arquivo invalido');
		}

		const slideIndex = Number(match[1]);

		if (images.has(slideIndex)) {
			throw new Error('Envie apenas uma imagem por slide');
		}

		images.set(slideIndex, {
			buffer: await part.toBuffer(),
			filename: part.filename,
			mimetype: part.mimetype,
		});
	}

	return { images, input: normalizeInput(fields) };
}

async function readCarouselRequest(request: FastifyRequest) {
	const multipartRequest = request as MultipartRequest;

	if (multipartRequest.isMultipart()) {
		return readMultipartCarousel(multipartRequest);
	}

	return {
		images: new Map<number, CarouselImageFile>(),
		input: normalizeInput((request.body ?? {}) as Record<string, unknown>),
	};
}

async function uploadSlideImages(
	content: CarouselContentDTO,
	images: Map<number, CarouselImageFile>
): Promise<CarouselContentDTO> {
	const slides = await Promise.all(
		content.slides.map(async (slide, index) => {
			const image = images.get(index);
			const imageUrl = image
				? await uploadImage({
						buffer: image.buffer,
						filename: image.filename,
						folder: 'delivery-cruzeiro/carousels',
						mimetype: image.mimetype,
					})
				: slide.imageUrl;

			if (!imageUrl) {
				throw new Error(`Selecione uma imagem para o slide ${index + 1}`);
			}

			return { ...slide, imageUrl };
		})
	);

	return { ...content, slides };
}

async function ensureStoreAccess(userId: string, role: string, storeId: string) {
	const store = await prisma.store.findFirst({
		where: {
			id: storeId,
			...(role !== 'SUPER_ADMIN' && { users: { some: { id: userId } } }),
		},
		select: { id: true },
	});

	if (!store) {
		throw new Error('Loja nao encontrada ou sem permissao');
	}
}

function sendValidationError(
	reply: FastifyReply,
	validationError: Parameters<typeof formatZodError>[0]
) {
	const error = formatZodError(validationError);

	return reply.status(error.statusCode ?? 400).send({
		code: error.code,
		details: error.details,
		error: error.message,
	});
}

export async function listCarousels(
	request: FastifyRequest<{ Querystring: { storeId?: string } }>,
	reply: FastifyReply
) {
	try {
		const storeId = request.query.storeId?.trim();

		if (!storeId) {
			return reply.status(400).send({ error: 'storeId e obrigatorio' });
		}

		const user = (request as AuthenticatedRequest).user!;
		await ensureStoreAccess(user.id, user.role, storeId);
		const carousels = await prisma.carousel.findMany({
			where: { storeId },
			select: carouselSelect,
			orderBy: [{ isActive: 'desc' }, { updatedAt: 'desc' }],
		});

		return reply.send({ carousels, total: carousels.length });
	} catch (error) {
		console.error('Erro ao listar carousels:', error);
		const message = error instanceof Error ? error.message : 'Erro interno do servidor';
		return reply.status(message.includes('permissao') ? 404 : 500).send({ error: message });
	}
}

export async function getCarousel(
	request: FastifyRequest<{ Params: { id: string } }>,
	reply: FastifyReply
) {
	try {
		const carousel = await prisma.carousel.findUnique({
			where: { id: request.params.id },
			select: carouselSelect,
		});

		if (!carousel) {
			return reply.status(404).send({ error: 'Carousel nao encontrado' });
		}

		const user = (request as AuthenticatedRequest).user!;
		await ensureStoreAccess(user.id, user.role, carousel.storeId);
		return reply.send({ carousel });
	} catch (error) {
		console.error('Erro ao buscar carousel:', error);
		const message = error instanceof Error ? error.message : 'Erro interno do servidor';
		return reply.status(message.includes('permissao') ? 404 : 500).send({ error: message });
	}
}

export async function getActiveCarousel(
	request: FastifyRequest<{ Querystring: { storeId?: string } }>,
	reply: FastifyReply
) {
	try {
		const storeId = request.query.storeId?.trim();

		if (!storeId) {
			return reply.status(400).send({ error: 'storeId e obrigatorio' });
		}

		const carousel = await prisma.carousel.findFirst({
			where: { isActive: true, storeId },
			select: carouselSelect,
		});

		return reply.send({ carousel });
	} catch (error) {
		console.error('Erro ao buscar carousel ativo:', error);
		return reply.status(500).send({ error: 'Erro interno do servidor' });
	}
}

export async function createCarousel(request: FastifyRequest, reply: FastifyReply) {
	try {
		const { images, input } = await readCarouselRequest(request);
		const validation = createCarouselSchema.safeParse(input);

		if (!validation.success) {
			return sendValidationError(reply, validation.error);
		}

		const user = (request as AuthenticatedRequest).user!;
		await ensureStoreAccess(user.id, user.role, validation.data.storeId);
		const content = await uploadSlideImages(validation.data.content, images);
		const carousel = await prisma.carousel.create({
			data: {
				content,
				createdById: user.id,
				lastModifiedById: user.id,
				name: validation.data.name,
				storeId: validation.data.storeId,
			},
			select: carouselSelect,
		});

		return reply.status(201).send({ carousel, message: 'Carousel criado com sucesso' });
	} catch (error) {
		console.error('Erro ao criar carousel:', error);
		const message = error instanceof Error ? error.message : 'Erro interno do servidor';
		return reply.status(message.includes('Selecione') ? 400 : 500).send({ error: message });
	}
}

export async function updateCarousel(
	request: FastifyRequest<{ Params: { id: string } }>,
	reply: FastifyReply
) {
	try {
		const existing = await prisma.carousel.findUnique({
			where: { id: request.params.id },
			select: { content: true, storeId: true },
		});

		if (!existing) {
			return reply.status(404).send({ error: 'Carousel nao encontrado' });
		}

		const user = (request as AuthenticatedRequest).user!;
		await ensureStoreAccess(user.id, user.role, existing.storeId);
		const { images, input } = await readCarouselRequest(request);
		const validation = updateCarouselSchema.safeParse(input);

		if (!validation.success) {
			return sendValidationError(reply, validation.error);
		}

		const content = validation.data.content
			? await uploadSlideImages(validation.data.content, images)
			: undefined;
		const carousel = await prisma.carousel.update({
			where: { id: request.params.id },
			data: {
				...(content && { content }),
				...(validation.data.name && { name: validation.data.name }),
				lastModifiedById: user.id,
			},
			select: carouselSelect,
		});

		return reply.send({ carousel, message: 'Carousel atualizado com sucesso' });
	} catch (error) {
		console.error('Erro ao atualizar carousel:', error);
		const message = error instanceof Error ? error.message : 'Erro interno do servidor';
		return reply.status(message.includes('Selecione') ? 400 : 500).send({ error: message });
	}
}

export async function activateCarousel(request: FastifyRequest, reply: FastifyReply) {
	try {
		const validation = activateCarouselSchema.safeParse(request.body);

		if (!validation.success) {
			return sendValidationError(reply, validation.error);
		}

		const existing = await prisma.carousel.findUnique({
			where: { id: validation.data.id },
			select: { storeId: true },
		});

		if (!existing) {
			return reply.status(404).send({ error: 'Carousel nao encontrado' });
		}

		const user = (request as AuthenticatedRequest).user!;
		await ensureStoreAccess(user.id, user.role, existing.storeId);
		const carousel = await prisma.$transaction(async transaction => {
			await transaction.carousel.updateMany({
				where: { isActive: true, storeId: existing.storeId },
				data: { isActive: false, lastModifiedById: user.id },
			});

			return transaction.carousel.update({
				where: { id: validation.data.id },
				data: { isActive: true, lastModifiedById: user.id },
				select: carouselSelect,
			});
		});

		return reply.send({ carousel, message: 'Carousel ativado com sucesso' });
	} catch (error) {
		console.error('Erro ao ativar carousel:', error);
		return reply.status(500).send({ error: 'Erro interno do servidor' });
	}
}

export async function deleteCarousel(
	request: FastifyRequest<{ Params: { id: string } }>,
	reply: FastifyReply
) {
	try {
		const existing = await prisma.carousel.findUnique({
			where: { id: request.params.id },
			select: { storeId: true },
		});

		if (!existing) {
			return reply.status(404).send({ error: 'Carousel nao encontrado' });
		}

		const user = (request as AuthenticatedRequest).user!;
		await ensureStoreAccess(user.id, user.role, existing.storeId);
		await prisma.carousel.delete({ where: { id: request.params.id } });
		return reply.send({ message: 'Carousel deletado com sucesso' });
	} catch (error) {
		console.error('Erro ao deletar carousel:', error);
		return reply.status(500).send({ error: 'Erro interno do servidor' });
	}
}

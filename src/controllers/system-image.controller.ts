import type { FastifyReply, FastifyRequest } from 'fastify';
import { prisma } from '../lib/prisma.js';
import { canonicalImageDirectory } from '../services/image-directory.utils.js';
import { getImageUploadFolder, uploadImage } from '../services/image-upload.service.js';
import {
	ImageLibraryError,
	imageUsage,
	normalizeImageDirectory,
	removeSystemImage,
	syncSystemImages,
} from '../services/system-image.service.js';

function failure(error: unknown, reply: FastifyReply) {
	if (error instanceof ImageLibraryError)
		return reply.code(error.statusCode).send({ error: error.message });
	if (error && typeof error === 'object' && 'statusCode' in error && error.statusCode === 413)
		return reply.code(413).send({ error: 'A imagem deve ter no máximo 5 MB' });
	return reply
		.code(502)
		.send({ error: 'Não foi possível acessar o armazenamento de imagens. Tente novamente.' });
}

export async function listSystemImages(
	request: FastifyRequest<{
		Querystring: { directory?: string; search?: string; kind?: string; page?: number };
	}>,
	reply: FastifyReply
) {
	const { search, kind } = request.query;
	const directory = request.query.directory && canonicalImageDirectory(request.query.directory);
	const page = Math.max(1, Number(request.query.page) || 1);
	const pageSize = 30;
	const usage = kind ? await imageUsage() : [];
	const kindUrls = [
		...new Set(
			usage
				.filter(item => item.kind === kind)
				.flatMap(item => [item.imageUrl, ...item.imageUrls])
				.filter((url): url is string => Boolean(url))
		),
	];
	const where = {
		deleting: false,
		...(directory && { OR: [{ directory }, { directory: { startsWith: directory + '/' } }] }),
		...(search && { name: { contains: search, mode: 'insensitive' as const } }),
		...(kind && { url: { in: kindUrls } }),
	};
	const [images, total, directories] = await Promise.all([
		prisma.systemImage.findMany({
			where,
			skip: (page - 1) * pageSize,
			take: pageSize,
			orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
		}),
		prisma.systemImage.count({ where }),
		prisma.systemImage.findMany({
			where: { deleting: false },
			distinct: ['directory'],
			select: { directory: true },
			orderBy: { directory: 'asc' },
		}),
	]);
	const references = await imageUsage(images.map(image => image.url));
	return reply.send({
		images: images.map(image => ({
			...image,
			usage: references
				.filter(item => item.imageUrl === image.url || item.imageUrls.includes(image.url))
				.map(({ id, name, kind }) => ({ id, name, kind })),
		})),
		total,
		page,
		pageSize,
		directories: directories.map(item => item.directory),
	});
}

export async function createSystemImage(request: FastifyRequest, reply: FastifyReply) {
	try {
		let file: { buffer: Buffer; filename: string; mimetype: string } | undefined;
		let directory = 'geral';
		for await (const part of request.parts({
			limits: { files: 1, fileSize: 5 * 1024 * 1024 },
		})) {
			if (part.type === 'field' && part.fieldname === 'directory')
				directory = String(part.value);
			if (part.type === 'file') {
				if (
					!['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif'].includes(
						part.mimetype
					)
				)
					throw new ImageLibraryError('Selecione uma imagem JPG, PNG, WebP, GIF ou AVIF');
				file = {
					buffer: await part.toBuffer(),
					filename: part.filename,
					mimetype: part.mimetype,
				};
			}
		}
		if (!file) throw new ImageLibraryError('Selecione uma imagem');
		directory = normalizeImageDirectory(directory);
		const url = await uploadImage({
			...file,
			folder: `${getImageUploadFolder()}/${directory}`,
		});
		const image = await prisma.systemImage.findUniqueOrThrow({ where: { url } });
		return reply.code(201).send({ image });
	} catch (error) {
		return failure(error, reply);
	}
}

export async function updateSystemImage(
	request: FastifyRequest<{
		Params: { id: string };
		Body: { name?: string; directory?: string };
	}>,
	reply: FastifyReply
) {
	try {
		const { name, directory } = request.body;
		if (name === undefined && directory === undefined)
			throw new ImageLibraryError('Informe um nome ou diretório');
		const image = await prisma.systemImage.findUnique({ where: { id: request.params.id } });
		if (!image || image.deleting) throw new ImageLibraryError('Imagem não encontrada', 404);
		return reply.send({
			image: await prisma.systemImage.update({
				where: { id: image.id },
				data: {
					...(name !== undefined && { name: name.trim() }),
					...(directory !== undefined && {
						directory: normalizeImageDirectory(directory),
					}),
				},
			}),
		});
	} catch (error) {
		return failure(error, reply);
	}
}

export async function deleteSystemImage(
	request: FastifyRequest<{ Params: { id: string } }>,
	reply: FastifyReply
) {
	try {
		await removeSystemImage(request.params.id);
		return reply.send({ message: 'Imagem excluída' });
	} catch (error) {
		return failure(error, reply);
	}
}

export async function synchronizeSystemImages(
	request: FastifyRequest<{ Body: { cursor?: string } }>,
	reply: FastifyReply
) {
	try {
		return reply.send(await syncSystemImages(request.body?.cursor));
	} catch (error) {
		return failure(error, reply);
	}
}

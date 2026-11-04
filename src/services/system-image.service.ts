import { prisma } from '../lib/prisma.js';
import { canonicalImageDirectory } from './image-directory.utils.js';
import { configureCloudinary, getImageUploadFolder } from './image-upload.service.js';

export class ImageLibraryError extends Error {
	constructor(
		message: string,
		public statusCode = 400
	) {
		super(message);
	}
}

export function normalizeImageDirectory(value: string) {
	const directory = value
		.trim()
		.replace(/\\/g, '/')
		.replace(/^\/+|\/+$/g, '');
	if (
		!directory ||
		directory.length > 200 ||
		directory.split('/').some(part => !part.trim() || part === '.' || part === '..') ||
		/[\u0000-\u001f<>:"|?*]/.test(directory)
	) {
		throw new ImageLibraryError('Informe um diretório válido, como produtos/pasteis');
	}
	return canonicalImageDirectory(directory);
}

export async function imageUsage(urls?: string[]) {
	if (urls && !urls.length) return [];
	const [categories, subcategories, products, menus, carousels] = await Promise.all([
		prisma.category.findMany({
			where: urls
				? { OR: [{ imageUrl: { in: urls } }, { imageUrls: { hasSome: urls } }] }
				: undefined,
			select: { id: true, name: true, imageUrl: true, imageUrls: true },
		}),
		prisma.subcategory.findMany({
			where: urls
				? { OR: [{ imageUrl: { in: urls } }, { imageUrls: { hasSome: urls } }] }
				: undefined,
			select: { id: true, name: true, imageUrl: true, imageUrls: true },
		}),
		prisma.product.findMany({
			where: urls
				? { OR: [{ imageUrl: { in: urls } }, { imageUrls: { hasSome: urls } }] }
				: undefined,
			select: { id: true, name: true, imageUrl: true, imageUrls: true },
		}),
		prisma.menu.findMany({
			where: urls ? { imageUrl: { in: urls } } : undefined,
			select: { id: true, name: true, imageUrl: true },
		}),
		prisma.carousel.findMany({ select: { id: true, name: true, content: true } }),
	]);
	return [
		...categories.map(item => ({ ...item, kind: 'categorias' })),
		...subcategories.map(item => ({ ...item, kind: 'subcategorias' })),
		...products.map(item => ({ ...item, kind: 'produtos' })),
		...menus.map(item => ({
			...item,
			kind: 'menus',
			imageUrls: item.imageUrl ? [item.imageUrl] : [],
		})),
		...carousels.map(item => ({
			id: item.id,
			name: item.name,
			kind: 'carrossel',
			imageUrl: null,
			imageUrls: (
				(item.content as { slides?: { imageUrl?: string }[] }).slides ?? []
			).flatMap(slide => (slide.imageUrl ? [slide.imageUrl] : [])),
		})),
	];
}

// Lock image rows in the same transaction as the catalog write. A deletion cannot
// pass the usage check while another request attaches that image.
export async function saveWithImages<T>(
	input: { imageUrls?: string[]; imageUrl?: string },
	uploaded: string | undefined,
	save: (data: { imageUrls?: string[]; imageUrl?: string | null }) => Promise<T>
) {
	const urls = input.imageUrls ?? (uploaded ? [uploaded] : undefined);
	if (urls === undefined) return save({});
	return prisma.$transaction(async () => {
		const unique = [...new Set(urls)];
		for (const url of [...unique].sort()) {
			const locked = await prisma.systemImage.updateMany({
				where: { url, deleting: false },
				data: { updatedAt: new Date() },
			});
			if (locked.count !== 1)
				throw new ImageLibraryError('Selecione uma imagem disponível na biblioteca');
		}
		return save({ imageUrls: unique, imageUrl: unique[0] ?? null });
	});
}

export async function removeSystemImage(id: string) {
	const image = await prisma.$transaction(async () => {
		const record = await prisma.systemImage.findUnique({ where: { id } });
		if (!record) throw new ImageLibraryError('Imagem não encontrada', 404);
		const locked = await prisma.systemImage.updateMany({
			where: { id, deleting: false },
			data: { deleting: true },
		});
		if (locked.count !== 1)
			throw new ImageLibraryError('Esta imagem já está sendo excluída. Aguarde.', 409);
		const usage = (await imageUsage([record.url])).filter(
			item => item.imageUrl === record.url || item.imageUrls.includes(record.url)
		);
		if (usage.length)
			throw new ImageLibraryError(
				`Imagem em uso: ${usage
					.slice(0, 5)
					.map(item => item.name)
					.join(', ')}. Remova as referências antes de excluir.`,
				409
			);
		return record;
	});
	try {
		if (image.publicId) {
			const result = await configureCloudinary().uploader.destroy(image.publicId, {
				resource_type: 'image',
				invalidate: true,
			});
			if (result.result !== 'ok' && result.result !== 'not found')
				throw new Error('O armazenamento não confirmou a exclusão');
		}
		await prisma.systemImage.delete({ where: { id } });
	} catch (error) {
		// Keep a retryable record and the stable URL if the provider is unavailable.
		await prisma.systemImage.update({ where: { id }, data: { deleting: false } });
		throw error;
	}
}

export async function syncSystemImages(cursor?: string) {
	const cloud = configureCloudinary();
	const prefix = getImageUploadFolder().replace(/\/+$/, '') + '/';
	const result = await cloud.api.resources({
		type: 'upload',
		resource_type: 'image',
		prefix,
		max_results: 100,
		...(cursor && { next_cursor: cursor }),
	});
	let imported = 0;
	for (const resource of result.resources) {
		if (!resource.public_id.startsWith(prefix)) continue;
		const relative = resource.public_id.slice(prefix.length);
		const directory = canonicalImageDirectory(relative.includes('/')
			? relative.slice(0, relative.lastIndexOf('/'))
			: 'geral');
		const data = {
			publicId: resource.public_id,
			width: resource.width,
			height: resource.height,
			bytes: resource.bytes,
		};
		await prisma.systemImage.upsert({
			where: { url: resource.secure_url },
			update: data,
			create: {
				...data,
				url: resource.secure_url,
				directory,
				name: relative.split('/').pop() || 'Imagem',
			},
		});
		imported++;
	}
	return { imported, nextCursor: result.next_cursor ?? null };
}

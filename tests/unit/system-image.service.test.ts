import { beforeEach, describe, expect, it, vi } from 'vitest';
const db = vi.hoisted(() => ({
	systemImage: { updateMany: vi.fn(), findUnique: vi.fn(), update: vi.fn(), delete: vi.fn(), upsert: vi.fn() },
	category: { findMany: vi.fn() },
	subcategory: { findMany: vi.fn() },
	product: { findMany: vi.fn() },
	menu: { findMany: vi.fn() },
	carousel: { findMany: vi.fn() },
}));
const provider = vi.hoisted(() => ({ destroy: vi.fn(), resources: vi.fn() }));
vi.mock('../../src/lib/prisma.js', () => ({
	prisma: { ...db, $transaction: (callback: () => unknown) => callback() },
}));
vi.mock('../../src/services/image-upload.service.js', () => ({
	configureCloudinary: () => ({ uploader: provider, api: provider }),
	getImageUploadFolder: () => 'delivery-cruzeiro',
}));
import {
	normalizeImageDirectory,
	removeSystemImage,
	saveWithImages,
	syncSystemImages,
} from '../../src/services/system-image.service.js';

beforeEach(() => {
	vi.resetAllMocks();
	for (const model of [db.category, db.subcategory, db.product, db.menu, db.carousel])
		model.findMany.mockResolvedValue([]);
	db.systemImage.updateMany.mockResolvedValue({ count: 1 });
	db.systemImage.findUnique.mockResolvedValue({
		id: 'image-1',
		url: 'https://images.test/one.png',
		publicId: 'delivery-cruzeiro/products/one',
	});
	db.systemImage.update.mockResolvedValue({});
	provider.destroy.mockResolvedValue({ result: 'ok' });
});
describe('system image references', () => {
	it('clears both the ordered gallery and the legacy cover when removing the last reference', async () => {
		const save = vi.fn().mockResolvedValue({});
		await saveWithImages({ imageUrls: [] }, undefined, save);
		expect(save).toHaveBeenCalledWith({ imageUrls: [], imageUrl: null });
	});
	it('does not change images for an unrelated partial update', async () => {
		const save = vi.fn();
		await saveWithImages({}, undefined, save);
		expect(save).toHaveBeenCalledWith({});
		expect(db.systemImage.updateMany).not.toHaveBeenCalled();
	});
	it('rejects deleted or unknown image URLs before persisting a reference', async () => {
		db.systemImage.updateMany.mockResolvedValue({ count: 0 });
		const save = vi.fn();
		await expect(
			saveWithImages({ imageUrls: ['https://unknown.test/a.png'] }, undefined, save)
		).rejects.toThrow('disponível');
		expect(save).not.toHaveBeenCalled();
	});
	it('keeps gallery order while locking and deduplicating image URLs', async () => {
		const save = vi.fn();
		await saveWithImages(
			{
				imageUrls: [
					'https://images.test/b.png',
					'https://images.test/a.png',
					'https://images.test/b.png',
				],
			},
			undefined,
			save
		);
		expect(save).toHaveBeenCalledWith({
			imageUrls: ['https://images.test/b.png', 'https://images.test/a.png'],
			imageUrl: 'https://images.test/b.png',
		});
		expect(db.systemImage.updateMany.mock.calls.map(call => call[0].where.url)).toEqual([
			'https://images.test/a.png',
			'https://images.test/b.png',
		]);
	});
});
describe('library deletion', () => {
	it('blocks deletion while a secondary gallery reference uses the image', async () => {
		db.product.findMany.mockResolvedValue([
			{ id: 'p', name: 'Pastel', imageUrl: null, imageUrls: ['https://images.test/one.png'] },
		]);
		await expect(removeSystemImage('image-1')).rejects.toMatchObject({ statusCode: 409 });
		expect(provider.destroy).not.toHaveBeenCalled();
		expect(db.systemImage.delete).not.toHaveBeenCalled();
	});
	it('blocks deletion of an image used by a carousel', async () => {
		db.carousel.findMany.mockResolvedValue([
			{
				id: 'c',
				name: 'Destaques',
				content: { slides: [{ imageUrl: 'https://images.test/one.png' }] },
			},
		]);
		await expect(removeSystemImage('image-1')).rejects.toMatchObject({ statusCode: 409 });
		expect(provider.destroy).not.toHaveBeenCalled();
	});
	it('retains a retryable metadata record when storage deletion fails', async () => {
		provider.destroy.mockRejectedValue(new Error('provider unavailable'));
		await expect(removeSystemImage('image-1')).rejects.toThrow('provider unavailable');
		expect(db.systemImage.delete).not.toHaveBeenCalled();
		expect(db.systemImage.update).toHaveBeenLastCalledWith({
			where: { id: 'image-1' },
			data: { deleting: false },
		});
	});
	it('deletes an unused managed file before removing its metadata', async () => {
		await removeSystemImage('image-1');
		expect(provider.destroy).toHaveBeenCalledWith('delivery-cruzeiro/products/one', {
			resource_type: 'image',
			invalidate: true,
		});
		expect(db.systemImage.delete).toHaveBeenCalledWith({ where: { id: 'image-1' } });
	});
});
describe('image directory validation', () => {
	it('merges English roots into Portuguese while preserving nested custom directories', () => {
		for (const [source, target] of [['categories', 'categorias'], ['subcategories', 'subcategorias'], ['products', 'produtos'], ['carousels', 'carrossel'], ['carousel', 'carrossel']]) {
			expect(normalizeImageDirectory(source)).toBe(target);
			expect(normalizeImageDirectory(`${source}/Fotos especiais`)).toBe(`${target}/Fotos especiais`);
		}
		expect(normalizeImageDirectory('Produtos/pasteis')).toBe('produtos/pasteis');
		expect(normalizeImageDirectory('campanhas/products')).toBe('campanhas/products');
	});
	it('synchronizes legacy storage folders into Portuguese without changing URLs or overriding custom moves', async () => {
		provider.resources.mockResolvedValue({ resources: [{ public_id: 'delivery-cruzeiro/categories/pasteis/banner', secure_url: 'https://images.test/original.jpg', width: 100, height: 100, bytes: 1000 }] });
		await syncSystemImages();
		expect(db.systemImage.upsert).toHaveBeenCalledWith(expect.objectContaining({
			where: { url: 'https://images.test/original.jpg' },
			create: expect.objectContaining({ directory: 'categorias/pasteis', publicId: 'delivery-cruzeiro/categories/pasteis/banner', url: 'https://images.test/original.jpg' }),
		}));
		expect(db.systemImage.upsert.mock.calls[0][0].update).not.toHaveProperty('directory');
	});
	it('supports nested directories and rejects traversal or empty segments', () => {
		expect(normalizeImageDirectory('/produtos/pasteis/')).toBe('produtos/pasteis');
		for (const directory of ['../outside', 'a/../b', 'a//b', 'a/./b', '', 'a\u0000b'])
			expect(() => normalizeImageDirectory(directory)).toThrow();
	});
});

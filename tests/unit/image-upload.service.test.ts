import { afterEach, describe, expect, it, vi } from 'vitest';
import { v2 as cloudinary } from 'cloudinary';
import { prisma } from '../../src/lib/prisma.js';
vi.mock('../../src/lib/prisma.js', () => ({ prisma: { systemImage: { create: vi.fn().mockResolvedValue({ id: 'image-1' }) } } }));
import { uploadImage } from '../../src/services/image-upload.service.js';

afterEach(() => {
	vi.unstubAllEnvs();
	vi.restoreAllMocks();
	cloudinary.config(true);
});

describe('image storage configuration', () => {
	it('stores legacy catalog uploads under Portuguese roots and records canonical metadata', async () => {
		vi.stubEnv('CLOUDINARY_URL', 'cloudinary://test-key:test-secret@test-cloud');
		const stream = vi.spyOn(cloudinary.uploader, 'upload_stream').mockImplementation((_options: unknown, callback: unknown) => {
			(callback as Function)(undefined, { secure_url: 'https://example.com/image.png', public_id: 'delivery-cruzeiro/produtos/pasteis/image' });
			return { end: vi.fn() } as never;
		});
		await uploadImage({ buffer: Buffer.from('image'), mimetype: 'image/png', folder: 'delivery-cruzeiro/products/pasteis' });
		expect(stream).toHaveBeenCalledWith(expect.objectContaining({ folder: 'delivery-cruzeiro/produtos/pasteis' }), expect.any(Function));
		expect(prisma.systemImage.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ directory: 'produtos/pasteis' }) }));
	});
	it('reloads CLOUDINARY_URL provided after the SDK import and streams the image', async () => {
		cloudinary.config({ cloud_name: 'old', api_key: undefined, api_secret: undefined });
		vi.stubEnv('CLOUDINARY_URL', 'cloudinary://test-key:test-secret@test-cloud');
		const end = vi.fn();
		const stream = vi
			.spyOn(cloudinary.uploader, 'upload_stream')
			.mockImplementation((_options: unknown, callback: unknown) => {
				(callback as Function)(undefined, { secure_url: 'https://example.com/image.png' });
				return { end } as never;
			});
		const buffer = Buffer.from('image');
		await expect(uploadImage({ buffer, mimetype: 'image/png' })).resolves.toBe(
			'https://example.com/image.png'
		);
		expect(cloudinary.config()).toMatchObject({
			cloud_name: 'test-cloud',
			api_key: 'test-key',
			api_secret: 'test-secret',
			secure: true,
		});
		expect(stream).toHaveBeenCalledOnce();
		expect(end).toHaveBeenCalledWith(buffer);
	});
	it('fails with a diagnostic before contacting the provider when credentials are missing', async () => {
		for (const key of [
			'CLOUDINARY_URL',
			'CLOUDINARY_CLOUD_NAME',
			'CLOUDINARY_API_KEY',
			'CLOUDINARY_API_SECRET',
		])
			vi.stubEnv(key, '');
		cloudinary.config(true);
		const stream = vi.spyOn(cloudinary.uploader, 'upload_stream');
		await expect(
			uploadImage({ buffer: Buffer.from('image'), mimetype: 'image/png' })
		).rejects.toThrow('IMAGE_STORAGE_NOT_CONFIGURED');
		expect(stream).not.toHaveBeenCalled();
	});
});

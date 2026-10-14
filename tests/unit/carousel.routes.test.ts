import Fastify from 'fastify';
import { afterEach, describe, expect, it, vi } from 'vitest';

const { findFirst } = vi.hoisted(() => ({ findFirst: vi.fn() }));
vi.mock('../../src/lib/prisma.js', () => ({ prisma: { carousel: { findFirst } } }));
vi.mock('../../src/middleware/auth.middleware.js', () => ({ requireManager: vi.fn() }));
vi.mock('../../src/services/image-upload.service.js', () => ({ uploadImage: vi.fn() }));
import { carouselRoutes } from '../../src/routes/carousel.routes.js';

afterEach(() => vi.clearAllMocks());
describe('carousel response contract', () => {
	it('keeps the saved size in the public response and accepts legacy content', async () => {
		const app = Fastify();
		await app.register(carouselRoutes);
		const content = {
			durationSeconds: 5,
			transition: 'FADE',
			slides: [{ imageUrl: 'https://example.com/banner.jpg', html: '' }],
		};
		const carousel = {
			id: 'carousel-1',
			name: 'Destaques',
			storeId: 'store-1',
			isActive: true,
			createdAt: new Date(),
			updatedAt: new Date(),
			createdBy: { id: 'user-1', name: 'Admin' },
			lastModifiedBy: { id: 'user-1', name: 'Admin' },
		};
		try {
			for (const size of ['SMALL', 'MEDIUM', 'LARGE', undefined]) {
				findFirst.mockResolvedValue({
					...carousel,
					content: { ...content, ...(size && { size }) },
				});
				const response = await app.inject('/carousels/active?storeId=store-1');
				expect(response.statusCode).toBe(200);
				expect(response.json().carousel.content.size).toBe(size);
			}
		} finally {
			await app.close();
		}
	});
});

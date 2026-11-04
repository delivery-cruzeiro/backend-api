import Fastify from 'fastify';
import multipart from '@fastify/multipart';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { productRoutes } from '../../src/routes/product.routes.js';
import { categoryRoutes } from '../../src/routes/category.routes.js';
import { subcategoryRoutes } from '../../src/routes/subcategory.routes.js';

const identity = vi.hoisted(() => ({ role: 1 }));
vi.mock('../../src/lib/auth.js', () => ({
	auth: { api: { getSession: async () => ({ user: { id: 'u' } }) } },
}));
vi.mock('../../src/lib/prisma.js', () => ({
	prisma: {
		user: {
			findUnique: async () => ({
				id: 'u',
				email: 'u@example.test',
				name: 'User',
				isActive: true,
				role: identity.role,
			}),
		},
	},
}));
vi.mock('../../src/controllers/product.controller.js', () =>
	Object.fromEntries(
		[
			'getProducts',
			'createProduct',
			'updateProduct',
			'deleteProduct',
			'bulkUpdateProducts',
		].map(name => [
			name,
			async (_request: unknown, reply: { send: (data: unknown) => unknown }) =>
				reply.send({ message: 'ok' }),
		])
	)
);
vi.mock('../../src/controllers/category.controller.js', () =>
	Object.fromEntries(
		['getCategories', 'createCategory', 'updateCategory', 'deleteCategory'].map(name => [
			name,
			async (_request: unknown, reply: { send: (data: unknown) => unknown }) =>
				reply.send({ message: 'ok' }),
		])
	)
);
vi.mock('../../src/controllers/subcategory.controller.js', () =>
	Object.fromEntries(
		['getSubcategories', 'createSubcategory', 'updateSubcategory', 'deleteSubcategory'].map(
			name => [
				name,
				async (_request: unknown, reply: { send: (data: unknown) => unknown }) =>
					reply.send({ message: 'ok' }),
			]
		)
	)
);

const app = Fastify();
await app.register(multipart);
await app.register(productRoutes);
await app.register(categoryRoutes);
await app.register(subcategoryRoutes);
afterEach(() => {
	identity.role = 1;
});

describe('catalog minimum access levels', () => {
	it.each([1, 2, 3, 4, 5])(
		'enforces status 2+ and editing/deletion 3+ for level %s',
		async role => {
			identity.role = role;
			for (const resource of ['products', 'categories', 'subcategories']) {
				const url = `/${resource}/item`;
				expect(
					(await app.inject({ method: 'PUT', url, payload: { isActive: false } }))
						.statusCode
				).toBe(role >= 2 ? 200 : 403);
				expect(
					(
						await app.inject({
							method: 'PUT',
							url,
							payload: { isActive: true, name: 'Changed' },
						})
					).statusCode
				).toBe(role >= 3 ? 200 : 403);
				expect((await app.inject({ method: 'DELETE', url })).statusCode).toBe(
					role >= 3 ? 200 : 403
				);
			}
			expect(
				(
					await app.inject({
						method: 'PUT',
						url: '/products/item',
						payload: { unavailable: true },
					})
				).statusCode
			).toBe(role >= 2 ? 200 : 403);
			expect(
				(
					await app.inject({
						method: 'PUT',
						url: '/products/bulk-update',
						payload: { appendName: 'Changed' },
					})
				).statusCode
			).toBe(role >= 3 ? 200 : 403);
			expect(
				(
					await app.inject({
						method: 'PUT',
						url: '/products/bulk-update',
						payload: { mode: 'products', productIds: ['item'], isActive: false },
					})
				).statusCode
			).toBe(role >= 2 ? 200 : 403);
		}
	);

	it('does not allow level 2 to smuggle other fields or files through multipart', async () => {
		identity.role = 2;
		const status =
			'--boundary\r\nContent-Disposition: form-data; name="isActive"\r\n\r\nfalse\r\n';
		for (const resource of ['products', 'categories', 'subcategories']) {
			const inject = (payload: string) =>
				app.inject({
					method: 'PUT',
					url: `/${resource}/item`,
					headers: { 'content-type': 'multipart/form-data; boundary=boundary' },
					payload,
				});
			expect((await inject(status + '--boundary--\r\n')).statusCode).toBe(200);
			expect(
				(
					await inject(
						status +
							'--boundary\r\nContent-Disposition: form-data; name="name"\r\n\r\nChanged\r\n--boundary--\r\n'
					)
				).statusCode
			).toBe(403);
			expect(
				(
					await inject(
						status +
							'--boundary\r\nContent-Disposition: form-data; name="image"; filename="x.png"\r\nContent-Type: image/png\r\n\r\nimage\r\n--boundary--\r\n'
					)
				).statusCode
			).toBe(403);
		}
	});
});

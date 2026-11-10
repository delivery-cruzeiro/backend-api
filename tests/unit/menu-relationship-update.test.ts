import { beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ findUnique: vi.fn(), update: vi.fn(), count: vi.fn() }));
vi.mock('../../src/lib/prisma.js', () => ({ prisma: {
	menu: { findUnique: mocks.findUnique, update: mocks.update },
	subcategory: { count: mocks.count },
} }));
import { updateMenu } from '../../src/controllers/menu.controller.js';

beforeEach(() => {
	vi.clearAllMocks();
	mocks.findUnique.mockResolvedValue({ id: 'menu-1' });
	mocks.count.mockResolvedValue(1);
	mocks.update.mockResolvedValue({ id: 'menu-1', categories: [], subcategories: [] });
});

it.each([
	{ categoryIds: '[]', subcategoryIds: '["00000000-0000-4000-8000-000000000001"]' },
	{ categoryIds: '[]', subcategoryIds: '[]' },
])('replaces relationships with explicit multipart selections: %j', async fields => {
	const response = { status: vi.fn().mockReturnThis(), send: vi.fn() };
	await updateMenu({
		params: { id: 'menu-1' },
		isMultipart: () => true,
		async *parts() {
			for (const [fieldname, value] of Object.entries(fields)) yield { type: 'field', fieldname, value };
		},
	} as never, response as never);
	expect(response.status).not.toHaveBeenCalled();
	expect(mocks.update).toHaveBeenCalledWith(expect.objectContaining({
		where: { id: 'menu-1' },
		data: expect.objectContaining({
			categories: { set: [] },
			subcategories: { set: JSON.parse(fields.subcategoryIds).map((id: string) => ({ id })) },
		}),
	}));
});

it('preserves relationships when omitted from a partial update', async () => {
	const response = { status: vi.fn().mockReturnThis(), send: vi.fn() };
	await updateMenu({ params: { id: 'menu-1' }, isMultipart: () => false, body: { order: 2 } } as never, response as never);
	const data = mocks.update.mock.calls[0][0].data;
	expect(data).not.toHaveProperty('categories');
	expect(data).not.toHaveProperty('subcategories');
});

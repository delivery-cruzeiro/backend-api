import { beforeEach, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ findUnique: vi.fn(), update: vi.fn(), create: vi.fn(), count: vi.fn() }));
vi.mock('../../src/lib/prisma.js', () => ({ prisma: {
  product: { findUnique: mocks.findUnique, update: mocks.update, create: mocks.create },
  category: { findUnique: async () => ({ id: 'cat' }) },
  subcategory: { count: mocks.count },
} }));
vi.mock('../../src/services/catalog-store.utils.js', () => ({
  buildStoreConnect: vi.fn(), buildStoreFilter: vi.fn(), buildStoreSet: vi.fn(),
  ensureActiveStoresExist: vi.fn(), getStoreIdQuery: vi.fn(), getStoreValidationStatus: vi.fn(), storeSummaryListArgs: {},
}));
import { createProduct, updateProduct } from '../../src/controllers/product.controller.js';
const ids = ['00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000002'];
beforeEach(() => {
  vi.clearAllMocks();
  mocks.findUnique.mockResolvedValue({ id: 'p', categoryId: ids[0], stores: [] });
  const result = { id: 'p', price: 1, additionalFields: [], category: { id: ids[0], additionalFields: [] }, subcategory: null, subcategories: ids.map(id => ({ id, additionalFields: [] })), badges: [] };
  mocks.update.mockResolvedValue(result); mocks.create.mockResolvedValue(result);
  mocks.count.mockImplementation(async ({ where }) => where.id.in.length);
});
const reply = () => ({ status: vi.fn().mockReturnThis(), send: vi.fn() });
const request = (body: unknown) => ({ params: { id: 'p' }, body, isMultipart: () => false });
it('creates several memberships and returns every selected id', async () => {
  const response = reply();
  await createProduct(request({ categoryId: ids[0], subcategoryIds: ids, name: 'Produto', description: 'Teste', price: 1, storeIds: [ids[0]] }) as never, response as never);
  expect(response.status).toHaveBeenCalledWith(201);
  expect(mocks.create.mock.calls[0][0].data.subcategories.connect).toEqual(ids.map(id => ({ id })));
  expect(response.send.mock.calls[0][0].product.subcategoryIds).toEqual(ids);
});
it.each([{ selected: ids }, { selected: [] }])('replaces or clears memberships from multipart input: %j', async ({ selected }) => {
  const response = reply();
  await updateProduct({ params: { id: 'p' }, isMultipart: () => true, async *parts() { yield { type: 'field', fieldname: 'subcategoryIds', value: JSON.stringify(selected) }; } } as never, response as never);
  expect(response.status).not.toHaveBeenCalled();
  expect(mocks.update.mock.calls[0][0].data.subcategories.set).toEqual(selected.map(id => ({ id })));
});
it('preserves memberships when updating the same category without selections', async () => {
  await updateProduct(request({ categoryId: ids[0], name: 'Nome' }) as never, reply() as never);
  expect(mocks.update.mock.calls[0][0].data).not.toHaveProperty('subcategories');
});
it('clears memberships on category change and accepts the legacy field', async () => {
  await updateProduct(request({ categoryId: ids[1] }) as never, reply() as never);
  expect(mocks.update.mock.calls[0][0].data.subcategories.set).toEqual([]);
  await updateProduct(request({ subcategoryId: ids[0] }) as never, reply() as never);
  expect(mocks.update.mock.calls[1][0].data.subcategories.set).toEqual([{ id: ids[0] }]);
});
it('rejects a subcategory outside the category before writing', async () => {
  mocks.count.mockResolvedValue(1);
  const response = reply();
  await updateProduct(request({ subcategoryIds: ids }) as never, response as never);
  expect(response.status).toHaveBeenCalledWith(404);
  expect(mocks.update).not.toHaveBeenCalled();
});

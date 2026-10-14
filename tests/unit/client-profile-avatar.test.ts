import { beforeEach, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ update: vi.fn(), findUnique: vi.fn() }));
vi.mock('../../src/lib/prisma.js', () => ({ prisma: { user: mocks } }));
import { getClientProfile, updateClientProfile } from '../../src/controllers/client.controller.js';

function reply() {
	const response = { send: vi.fn(), status: vi.fn() };
	response.status.mockReturnValue(response);
	return response;
}
beforeEach(() => vi.resetAllMocks());
it('writes the selected ID for the authenticated user and returns it on later profile reads', async () => {
	const user = { id: 'owner', name: 'Cliente', avatar: 'woman-2' };
	mocks.update.mockResolvedValue(user);
	mocks.findUnique.mockResolvedValue(user);
	const response = reply();
	await updateClientProfile({ user: { id: 'owner' }, body: { name: 'Cliente', avatar: 'woman-2' } } as never, response as never);
	expect(mocks.update).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'owner' }, data: { name: 'Cliente', avatar: 'woman-2' } }));
	await getClientProfile({ user: { id: 'owner' } } as never, response as never);
	expect(response.send).toHaveBeenLastCalledWith({ user });
});
it('persists null when clearing and rejects unknown images before database writes', async () => {
	const response = reply();
	await updateClientProfile({ user: { id: 'owner' }, body: { name: 'Cliente', avatar: null } } as never, response as never);
	expect(mocks.update).toHaveBeenCalledWith(expect.objectContaining({ data: { name: 'Cliente', avatar: null } }));
	mocks.update.mockClear();
	for (const avatar of ['anchor', 'https://example.com/image.png', 'missing']) {
		await updateClientProfile({ user: { id: 'owner' }, body: { name: 'Cliente', avatar } } as never, response as never);
		expect(response.status).toHaveBeenLastCalledWith(400);
	}
	expect(mocks.update).not.toHaveBeenCalled();
});

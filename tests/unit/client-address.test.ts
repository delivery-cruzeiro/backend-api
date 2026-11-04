import { Prisma } from '@prisma/client';
import { beforeEach, expect, it, vi } from 'vitest';

const database = vi.hoisted(() => ({
	address: { findFirst: vi.fn(), delete: vi.fn() },
}));
vi.mock('../../src/lib/prisma.js', () => ({ prisma: database }));
import { ClientAddressService } from '../../src/services/client-address.service.js';

const service = new ClientAddressService();
beforeEach(() => vi.resetAllMocks());

function databaseError(code: string) {
	return new Prisma.PrismaClientKnownRequestError('database guard', {
		code,
		clientVersion: 'test',
	});
}

it('removes a personal address belonging to the requesting user', async () => {
	database.address.findFirst.mockResolvedValue({ id: 'address', _count: { stores: 0 } });
	expect(await service.remove('owner', 'address')).toBe('removed');
	expect(database.address.findFirst).toHaveBeenCalledWith(expect.objectContaining({
		where: { id: 'address', userId: 'owner' },
	}));
	expect(database.address.delete).toHaveBeenCalledWith({
		where: { id: 'address', userId: 'owner', stores: { none: {} } },
	});
});

it('does not delete missing addresses or those belonging to another user', async () => {
	database.address.findFirst.mockResolvedValue(null);
	expect(await service.remove('other-user', 'address')).toBe('not_found');
	expect(database.address.delete).not.toHaveBeenCalled();
});

it('protects the store address even when its owner is the requesting user', async () => {
	database.address.findFirst.mockResolvedValue({ id: 'store-address', _count: { stores: 1 } });
	expect(await service.remove('owner', 'store-address')).toBe('in_use');
	expect(database.address.delete).not.toHaveBeenCalled();
});

it('handles a concurrent foreign key conflict without a server error', async () => {
	database.address.findFirst.mockResolvedValue({ id: 'address', _count: { stores: 0 } });
	database.address.delete.mockRejectedValue(databaseError('P2003'));
	expect(await service.remove('owner', 'address')).toBe('in_use');
});

it('handles an address removed concurrently', async () => {
	database.address.findFirst.mockResolvedValue({ id: 'address', _count: { stores: 0 } });
	database.address.delete.mockRejectedValue(databaseError('P2025'));
	expect(await service.remove('owner', 'address')).toBe('not_found');
});

it('does not hide unrelated database failures', async () => {
	database.address.findFirst.mockResolvedValue({ id: 'address', _count: { stores: 0 } });
	const failure = new Error('connection lost');
	database.address.delete.mockRejectedValue(failure);
	await expect(service.remove('owner', 'address')).rejects.toBe(failure);
});

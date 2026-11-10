import { adminCustomerSearchSchema, UserRole } from '@delivery-cruzeiro/types';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { searchAdminCustomers } from '../../src/services/admin-customer.service.js';

const { database } = vi.hoisted(() => ({ database: { user: { count: vi.fn(), findMany: vi.fn() } } }));
vi.mock('../../src/lib/prisma.js', () => ({ prisma: { $transaction: (callback: Function) => callback(database) } }));

beforeEach(() => vi.resetAllMocks());

describe('admin customer search', () => {
	it('combines profile filters with the customer role and paginates the filtered database query', async () => {
		database.user.count.mockResolvedValue(43);
		database.user.findMany.mockResolvedValue([]);
		const result = await searchAdminCustomers(adminCustomerSearchSchema.parse({
			page: 2, pageSize: 30, name: 'Ana_%', email: 'example', cpf: '123.456',
			isActive: false, emailVerified: false, gender: null, avatar: 'absent', updatedTo: '2026-11-08',
		}));
		const where = database.user.count.mock.calls[0][0].where;
		expect(where).toMatchObject({
			role: UserRole.CLIENT, name: { contains: 'Ana\\_\\%', mode: 'insensitive' },
			email: { contains: 'example' }, isActive: false, emailVerified: false, gender: null,
			OR: [{ cpf: { startsWith: '123456' } }, { cpf: { startsWith: '123.456' } }],
			AND: [{ OR: [{ avatar: null }, { avatar: '' }] }], updatedAt: { lt: new Date('2026-11-09T03:00:00Z') },
		});
		expect(database.user.findMany).toHaveBeenCalledWith(expect.objectContaining({ where, skip: 30, take: 30 }));
		expect(result).toMatchObject({ total: 43, page: 2, pageSize: 30, totalPages: 2 });
	});

	it('counts decrypted phone matches across batches before returning the requested page', async () => {
		const firstBatch = Array.from({ length: 500 }, (_, i) => ({ id: `a${i}`, phone: i < 10 ? '(83) 99911-2222' : null }));
		const match = { id: 'b1', phone: '+55 (83) 99911-2222' };
		const date = new Date('2026-11-07T10:00:00Z');
		database.user.findMany.mockResolvedValueOnce(firstBatch).mockResolvedValueOnce([match, { id: 'b2', phone: '1234' }]);
		database.user.findMany.mockResolvedValueOnce([{ ...match, createdAt: date, updatedAt: date }]);

		const result = await searchAdminCustomers(adminCustomerSearchSchema.parse({ phone: '99911-2222', page: 2 }));

		expect(database.user.count).not.toHaveBeenCalled();
		expect(database.user.findMany).toHaveBeenNthCalledWith(2, expect.objectContaining({ cursor: { id: 'a499' }, skip: 1 }));
		expect(database.user.findMany).toHaveBeenNthCalledWith(3, expect.objectContaining({ where: expect.objectContaining({ id: { in: ['b1'] }, role: UserRole.CLIENT }) }));
		expect(result).toMatchObject({ total: 11, totalPages: 2, customers: [{ id: 'b1', createdAt: date.toISOString() }] });
	});
});

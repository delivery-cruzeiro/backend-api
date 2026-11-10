import { describe, expect, it, vi } from 'vitest';
import { OrderStatus } from '@delivery-cruzeiro/types';
import { PrismaAdminOrderRepository } from '../../src/repositories/order.repository.js';

describe('order history repository', () => {
  it('combines filters and pages in the database with stable ordering and identical count criteria', async () => {
    const count = vi.fn().mockReturnValue(75);
    const findMany = vi.fn().mockReturnValue([]);
    const transaction = vi.fn(async callback => callback({ order: { count, findMany } }));
    const repository = new PrismaAdminOrderRepository({ order: { count, findMany }, $transaction: transaction } as never);
    const result = await repository.findHistory({ page: 2, pageSize: 30, storeId: 'store-1', customerName: 'Ana', orderNumber: 123, status: OrderStatus.CANCELLED, minTotal: 0, maxTotal: 100, startDate: '2026-10-01', endDate: '2026-10-31' });
    const where = count.mock.calls[0][0].where;
    expect(where).toEqual({ storeId: 'store-1', user: { name: { contains: 'Ana', mode: 'insensitive' } }, orderNumber: 123, status: 'CANCELLED', total: { gte: 0, lte: 100 }, createdAt: { gte: new Date('2026-10-01T03:00:00Z'), lt: new Date('2026-11-01T03:00:00Z') } });
    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({ where, skip: 30, take: 30, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }] }));
    expect(transaction).toHaveBeenCalledWith(expect.any(Function));
    expect(result).toEqual({ total: 75, orders: [] });
  });
  it('includes final statuses when no status is selected', async () => {
    const count = vi.fn().mockReturnValue(0);
    const order = { count, findMany: vi.fn().mockReturnValue([]) };
    const repository = new PrismaAdminOrderRepository({ order, $transaction: async callback => callback({ order }) } as never);
    await repository.findHistory({ page: 1, pageSize: 10 });
    expect(count).toHaveBeenCalledWith({ where: {} });
  });
  it('scopes a customer history to the exact client without narrowing to a store or status', async () => {
    const order = { count: vi.fn().mockResolvedValue(0), findMany: vi.fn().mockResolvedValue([]) };
    const repository = new PrismaAdminOrderRepository({ $transaction: async callback => callback({ order }) } as never);

    await repository.findHistory({ page: 1, pageSize: 10, customerId: 'customer-1' });

    expect(order.count).toHaveBeenCalledWith({ where: { userId: 'customer-1', user: { role: 1 } } });
    expect(order.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { userId: 'customer-1', user: { role: 1 } }, skip: 0, take: 10,
    }));
  });
});

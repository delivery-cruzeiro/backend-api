import { OrderStatus } from '@delivery-cruzeiro/types';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PrismaAdminOrderRepository } from '../../src/repositories/order.repository.js';

describe('prazo de entrega na confirmação', () => {
 afterEach(() => vi.useRealTimers());
 it('conta o prazo salvo a partir da confirmação e preserva a estimativa nas próximas etapas', async () => {
  vi.useFakeTimers(); vi.setSystemTime(new Date('2026-10-14T18:00:00Z'));
  const order = { id: 'order', confirmedAt: null as Date | null, deliveryMinutes: 35, estimatedDelivery: null as Date | null };
  const database = { order: { findUnique: vi.fn(async () => order), update: vi.fn(async ({ data }) => Object.assign(order, data)) } };
  const repository = new PrismaAdminOrderRepository(database as never);
  await repository.updateStatus('order', OrderStatus.CONFIRMED);
  expect(order.confirmedAt?.toISOString()).toBe('2026-10-14T18:00:00.000Z');
  expect(order.estimatedDelivery?.toISOString()).toBe('2026-10-14T18:35:00.000Z');
  vi.setSystemTime(new Date('2026-10-14T18:10:00Z'));
  await repository.updateStatus('order', OrderStatus.PREPARING);
  await repository.updateStatus('order', OrderStatus.CONFIRMED);
  expect(order.estimatedDelivery?.toISOString()).toBe('2026-10-14T18:35:00.000Z');
  expect(order.confirmedAt?.toISOString()).toBe('2026-10-14T18:00:00.000Z');
 });
});

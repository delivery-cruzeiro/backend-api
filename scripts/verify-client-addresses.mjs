// All fixtures run in a transaction which is deliberately rolled back. Existing
// addresses/orders are only read or sent to the protected store-address handler.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import Fastify from 'fastify';
import { prisma, disconnectPrisma } from '../dist/lib/prisma.js';
import { closeNominatimQueue } from '../dist/lib/nominatim-request-queue.js';
import {
  getClientAddresses, deleteClientAddress, updateClientAddress,
} from '../dist/controllers/client.controller.js';

const rollback = new Error('ROLLBACK_ADDRESS_VERIFICATION');
const prefix = `__qa_address_${randomUUID()}`;
let checks;
try {
  const store = await prisma.store.findFirst({
    select: { id: true, addressId: true, address: { select: { userId: true } } },
  });
  assert.ok(store, 'Existing store required');
  const ordersBefore = await prisma.order.count({ where: { addressId: store.addressId } });
  try {
    await prisma.$transaction(async () => {
      const owner = store.address.userId;
      const other = await prisma.user.create({ data: { email: `${prefix}@example.invalid`, name: prefix, role: 1 } });
      const data = { street: 'Rua de Teste', number: '123', neighborhood: 'Teste', city: 'Campina Grande', state: 'PB', zipCode: '58414060' };
      const personal = await prisma.address.create({ data: { ...data, userId: owner } });
      const foreign = await prisma.address.create({ data: { ...data, userId: other.id } });
      const app = Fastify();
      app.addHook('preHandler', async request => {
        request.user = { id: request.headers['x-qa-other'] ? other.id : owner };
      });
      app.get('/addresses', getClientAddresses);
      app.delete('/addresses/:id', deleteClientAddress);
      app.put('/addresses/:id', updateClientAddress);
      try {
        const list = await app.inject({ method: 'GET', url: '/addresses' });
        assert.equal(list.statusCode, 200);
        const ids = list.json().addresses.map(address => address.id);
        assert.ok(ids.includes(personal.id));
        assert.ok(!ids.includes(store.addressId));
        assert.ok(!ids.includes(foreign.id));
        const conflict = await app.inject({ method: 'DELETE', url: `/addresses/${store.addressId}` });
        assert.equal(conflict.statusCode, 409, conflict.body);
        assert.equal(conflict.json().code, 'ADDRESS_IN_USE');
        const edit = await app.inject({ method: 'PUT', url: `/addresses/${store.addressId}`, payload: { complement: 'forbidden' } });
        assert.equal(edit.statusCode, 404, edit.body);
        const denied = await app.inject({ method: 'DELETE', url: `/addresses/${personal.id}`, headers: { 'x-qa-other': '1' } });
        assert.equal(denied.statusCode, 404);
        assert.ok(await prisma.address.findUnique({ where: { id: personal.id } }));
        const removed = await app.inject({ method: 'DELETE', url: `/addresses/${personal.id}` });
        assert.equal(removed.statusCode, 200, removed.body);
        assert.equal(await prisma.address.findUnique({ where: { id: personal.id } }), null);
        const repeated = await app.inject({ method: 'DELETE', url: `/addresses/${personal.id}` });
        assert.equal(repeated.statusCode, 404);
        assert.equal((await prisma.store.findUnique({ where: { id: store.id } })).addressId, store.addressId);
        assert.equal(await prisma.order.count({ where: { addressId: store.addressId } }), ordersBefore);
        checks = { list: 200, protectedDeletion: 409, protectedEdition: 404, foreignDeletion: 404, personalDeletion: 200, repeatedDeletion: 404, preservedStoreOrders: ordersBefore };
      } finally {
        await app.close();
      }
      throw rollback;
    });
  } catch (error) {
    if (error !== rollback) throw error;
  }
  assert.equal(await prisma.user.count({ where: { name: prefix } }), 0);
  assert.equal(await prisma.order.count({ where: { addressId: store.addressId } }), ordersBefore);
  console.log(JSON.stringify({ ...checks, fixturesRolledBack: true }));
} finally {
  await disconnectPrisma();
  await closeNominatimQueue();
}

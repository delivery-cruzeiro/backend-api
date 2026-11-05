// Disposable restored database only. The upstream is a local HTTP simulation;
// no customer's address is sent to Nominatim and no real order is created.
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';
import { prisma, disconnectPrisma } from '../dist/lib/prisma.js';
import { closeNominatimQueue } from '../dist/lib/nominatim-request-queue.js';
import { CnefeGeocodingProvider } from '../dist/services/geocoding/cnefe-geocoding.provider.js';
import { StoreShippingService } from '../dist/services/store-shipping.service.js';
import { ClientOrderService } from '../dist/services/client-order.service.js';
import { AdminOrderService } from '../dist/services/admin-order.service.js';
import { PrismaClientOrderRepository } from '../dist/repositories/order.repository.js';
import { serializeAdminOrder } from '../dist/services/order-serialization.service.js';

if (!process.env.DATABASE_URL?.includes('dc-cnefe-managed-verify')) throw Error('Disposable restored database required');
const originalFetch = globalThis.fetch;
let mode = 'suburb', point, neighborhood, street, requests = 0;
const timing = [];
const server = createServer((request, response) => {
  assert.equal(request.headers['user-agent'].includes('DeliveryCruzeiro'), true);
  requests++;
  const started = Date.now();
  response.setHeader('content-type', 'application/json');
  const base = { lat: String(point.latitude), lon: String(point.longitude), address: {
    road: street, suburb: neighborhood, city: 'Campina Grande', state: 'Paraíba', country_code: 'br', postcode: '00000-000',
  } };
  response.end(JSON.stringify(mode === 'suburb' ? [
    { ...base, address: { ...base.address, suburb: 'Outro Bairro' } }, base,
    { ...base, lat: '-7.2' },
  ] : []));
  timing.push({ started, finished: Date.now() });
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
globalThis.fetch = (url, options) => {
  const parsed = new URL(url);
  assert.equal(parsed.hostname, 'nominatim.openstreetmap.org');
  return originalFetch(`http://127.0.0.1:${server.address().port}${parsed.pathname}${parsed.search}`, options);
};
try {
  const partition = await prisma.deliveryPartition.findFirst({ include: { neighborhood: true } });
  assert.ok(partition);
  neighborhood = partition.neighborhood.name;
  const stores = await prisma.store.findMany({ select: { addressId: true } });
  const storeIds = new Set(stores.map(s => s.addressId));
  const addresses = await prisma.address.findMany({ where: { zipCodeValidated: true } });
  let covered, local;
  for (const address of addresses.filter(a => !storeIds.has(a.id) && a.neighborhood === neighborhood)) {
    const result = await new CnefeGeocodingProvider().locate(address);
    if (result.status === 'found') { covered = address; local = result; break; }
  }
  assert.ok(covered); point = local.point;
  const shipping = new StoreShippingService();
  const input = address => ({ storeId: partition.storeId, addressId: address.id,
    city: address.city, state: address.state, neighborhood: address.neighborhood });
  const exact = await shipping.resolveShippingQuote(input(covered));
  assert.equal(exact.requiresAddressReview, undefined);
  assert.equal(requests, 0);
  const product = await prisma.product.findFirst({ where: { isActive: true, stores: { some: { id: partition.storeId } } } });
  assert.ok(product);
  street = `Rua de Verificacao ${randomUUID()}`;
  const approximate = await prisma.address.create({ data: { userId: covered.userId, street, number: '5255',
    city: covered.city, state: covered.state, neighborhood, zipCode: '58434500', zipCodeValidated: true } });
  const quote = await shipping.resolveShippingQuote(input(approximate));
  assert.equal(quote.requiresAddressReview, true);
  assert.equal(quote.addressReviewReason, 'suburb_fallback');
  assert.equal(quote.isAvailable, true);
  assert.equal(requests, 1, 'Reuse candidates from the precise HTTP response');
  const saved = await prisma.address.findUnique({ where: { id: approximate.id } });
  assert.equal(saved.geocodingSource, 'NOMINATIM_SUBURB');
  assert.equal(saved.geocodingQuality.precision, 'suburb');
  const dto = id => ({ addressId: id, storeId: partition.storeId, paymentType: 'CASH', items: [{ productId: product.id, quantity: 1 }] });
  const order = await new ClientOrderService().createOrder(covered.userId, dto(approximate.id));
  assert.equal(order.success, true, order.error);
  const repo = new PrismaClientOrderRepository();
  const admin = serializeAdminOrder(await repo.findAdminOrderById(order.order.id));
  assert.equal(admin.requiresAddressReview, true);
  assert.equal(admin.status, 'PENDING');
  assert.ok(admin.notes.includes('Necessita revisão de endereço'));
  const confirmed = await new AdminOrderService().updateOrderStatus(order.order.id, { status: 'CONFIRMED' });
  assert.equal(confirmed.status, 'CONFIRMED');
  assert.equal(confirmed.requiresAddressReview, true, 'Keep historical flag; UI hides it after pending');
  mode = 'empty';
  const missing = await prisma.address.create({ data: { userId: covered.userId, street, number: '99999',
    city: covered.city, state: covered.state, neighborhood, zipCode: '58434500', zipCodeValidated: true } });
  const fallback = await shipping.resolveShippingQuote(input(missing));
  const standard = await prisma.storeShipping.findFirst({ where: { storeId: partition.storeId, name: 'default' } });
  assert.equal(fallback.isAvailable, true);
  assert.equal(fallback.value, Number(standard.value));
  assert.equal(fallback.addressReviewReason, 'location_unavailable');
  const pending = await new ClientOrderService().createOrder(covered.userId, dto(missing.id));
  assert.equal(pending.success, true, pending.error);
  assert.equal(serializeAdminOrder(await repo.findAdminOrderById(pending.order.id)).requiresAddressReview, true);
  const blocked = await prisma.storeNeighborhoodShipping.findFirst({ where: { areaId: quote.areaId } });
  assert.ok(blocked);
  await prisma.storeNeighborhoodShipping.update({ where: { id: blocked.id }, data: { isBlocked: true } });
  assert.equal((await shipping.resolveShippingQuote(input(approximate))).isAvailable, false);
  const gaps = timing.slice(1).map((r, i) => r.started - timing[i].finished);
  assert.ok(gaps.every(gap => gap >= 1000));
  console.log(JSON.stringify({ cnefeExternalRequests: 0, suburbQuote: quote.value, defaultQuote: fallback.value,
    suburbPersisted: true, pendingFlag: true, confirmedHistoryPreserved: true, defaultOrderCreated: true,
    blockedAreaPreserved: true, requests, minCompletionGapMs: Math.min(...gaps),
    qaPendingOrder: pending.order.id, qaOwner: covered.userId }));
} finally {
  globalThis.fetch = originalFetch;
  await closeNominatimQueue(); await disconnectPrisma();
  await new Promise(resolve => server.close(resolve));
}

// Isolated browser fixture: real services/database, synthetic authenticated UI session.
import Fastify from 'fastify';
import { prisma } from '../dist/lib/prisma.js';
import { DeliveryAreaService } from '../dist/services/delivery-area.service.js';
import { StoreShippingService } from '../dist/services/store-shipping.service.js';
import { deliveryPartitionSchema } from '@delivery-cruzeiro/types';
import { upsertStoreNeighborhoodShipping } from '../dist/controllers/store-shipping.controller.js';
if (!process.env.DATABASE_URL?.includes('dc-area-postgres')) throw Error('Isolated database required');
const app = Fastify(); const areas = new DeliveryAreaService(); const shipping = new StoreShippingService();
const store = await prisma.store.findFirst({ include: { address: true } });
const user = { id: store.ownerId, role: 'SUPER_ADMIN', name: 'Verificação', email: 'test@example.invalid', isActive: true };
app.all('/api/*', async (req, reply) => {
 try {
 const path = req.url.split('?')[0];
 if (path.includes('/auth/')) return { user, session: { userId: user.id } };
 if (path === '/api/stores') return { stores: [store] };
 if (path === '/api/admin/store-shipping/map') return areas.map(store.id);
 if (path === '/api/admin/store-shipping/summary') return shipping.getSummary({ storeId: store.id });
 if (path === '/api/admin/store-shipping/preview') return { areas: (await areas.preview(deliveryPartitionSchema.parse(req.body))).areas };
 if (path === '/api/admin/store-shipping/partition') return areas.save(deliveryPartitionSchema.parse(req.body), async () => ({ value: 7, shippingTime: 35, isBlocked: false }));
 if (path === '/api/admin/store-shipping/neighborhood') return upsertStoreNeighborhoodShipping(req, reply);
 if (path.includes('printers')) return { printers: [], configurations: [] };
 return {};
 } catch(error) { return reply.status(error.statusCode ?? 400).send({ error: error.message }); }
});
await app.listen({ host: '0.0.0.0', port: 4001 });
console.log('Isolated browser fixture ready');


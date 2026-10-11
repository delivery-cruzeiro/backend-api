import assert from 'node:assert/strict';
import fs from 'node:fs';
import { randomUUID } from 'node:crypto';
import { splitDeliveryGeometry, deliveryGeometryCovers } from '@delivery-cruzeiro/types';
import { prisma, disconnectPrisma } from '../dist/lib/prisma.js';
import { DeliveryAreaService } from '../dist/services/delivery-area.service.js';
import { StoreShippingService } from '../dist/services/store-shipping.service.js';
import { databaseIdentity } from '../dist/security/database-context.js';

// Run only against the disposable restored database. Never mutate the operational database.
if (!process.env.DATABASE_URL?.includes('dc-area-postgres')) throw Error('Requires isolated verification database');
const areas = new DeliveryAreaService(), shipping = new StoreShippingService();
let realCuts = 0;
for (const feature of JSON.parse(fs.readFileSync('prisma/data/2504009.geojson', 'utf8')).features) {
 const coords = feature.geometry.coordinates.flat(feature.geometry.type === 'Polygon' ? 1 : 2);
 const xs = coords.map(p => p[0]), ys = coords.map(p => p[1]);
 const x = (Math.min(...xs) + Math.max(...xs))/2;
 const result = splitDeliveryGeometry(feature.geometry, [{ target: 0, start: [x,Math.min(...ys)-.001], end: [x,Math.max(...ys)+.001] }]);
 assert.ok(result.length >= 2); realCuts++;
}
console.log(`Real catalog: ${realCuts} neighborhoods divided with topology checks`);
try {
 const store = await prisma.store.findFirst({ include: { address: true } }); assert.ok(store);
 const map = await areas.map(store.id); assert.equal(map.features.length, 60);
 const feature = map.features.find(f => f.geometry.type === 'Polygon') ?? map.features[0];
 const coords = feature.geometry.coordinates.flat(feature.geometry.type === 'Polygon' ? 1 : 2);
 const xs = coords.map(p => p[0]), ys = coords.map(p => p[1]);
 const x = (Math.min(...xs) + Math.max(...xs))/2;
 const input = { storeId: store.id, neighborhoodId: feature.properties.id, baseRevision: 0, sourceHash: feature.properties.sourceHash, requestId: randomUUID(), cuts: [{ target: 0, start: [x,Math.min(...ys)-.001], end: [x,Math.max(...ys)+.001] }] };
 const preview = await areas.preview(input);
 const inherit = async () => ({ value: 7, shippingTime: 35, isBlocked: false });
 // Rollback includes all tables when a write fails after publishing begins.
 const before = await prisma.deliveryPartition.count();
 await assert.rejects(prisma.$transaction(async () => { await areas.save(input, inherit); throw Error('forced rollback'); }), /forced rollback/);
 assert.equal(await prisma.deliveryPartition.count(), before);
 const [saved, concurrent] = await Promise.all([areas.save(input, inherit), areas.save(input, inherit)]); assert.deepEqual(concurrent, saved);
 const children = saved.features.filter(f => f.properties.neighborhoodId === feature.properties.id);
 assert.equal(children.length, preview.areas.length);
 const replay = await areas.save(input, inherit); assert.deepEqual(replay, saved);
 await assert.rejects(areas.save({ ...input, cuts: [...input.cuts, input.cuts[0]] }, inherit), /Chave/);
 await assert.rejects(areas.save({ ...input, requestId: randomUUID() }, inherit), /dividido/);
 const a = children[0], b = children[1];
 await shipping.upsertNeighborhoodShipping({ storeId: store.id, neighborhood: a.properties.name, areaId: a.properties.areaId, mode: 'MANUAL', value: 13, shippingTime: 55, isBlocked: true });
 const ruleB = await prisma.storeNeighborhoodShipping.findUnique({ where: { areaId: b.properties.areaId } }); assert.equal(Number(ruleB.value), 7); assert.equal(ruleB.shippingTime, 35); assert.equal(ruleB.isBlocked, false);
 const pointInside = geometry => {
  for (const poly of geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates) {
   const pts = poly[0]; const bx = pts.map(p=>p[0]), by = pts.map(p=>p[1]);
   for(let i=1;i<20;i++) for(let j=1;j<20;j++) { const p=[Math.min(...bx)+(Math.max(...bx)-Math.min(...bx))*i/20,Math.min(...by)+(Math.max(...by)-Math.min(...by))*j/20]; if(deliveryGeometryCovers(geometry,p))return p; }
  } throw Error('No interior');
 };
 const p = pointInside(a.geometry);
 const quoteInput = { storeId: store.id, neighborhood: feature.properties.name, city: store.address.city, state: store.address.state, longitude: p[0], latitude: p[1], locationConfirmed: true };
 const blocked = await shipping.resolveShippingQuote(quoteInput); assert.equal(blocked.isAvailable,false); assert.equal(blocked.areaId,a.properties.areaId);
 assert.equal((await shipping.resolveShippingQuote({...quoteInput,locationConfirmed:false})).needsLocation,true);
 assert.equal((await shipping.resolveShippingQuote({...quoteInput,latitude:0,longitude:0})).needsLocation,true);
 await assert.rejects(databaseIdentity.run({kind:'user',userId:'not-a-store-member',role:'MANAGER'},()=>areas.map(store.id)), /acesso/);
 const summary = await shipping.getSummary({storeId:store.id}); assert.ok(summary.neighborhoods.some(n=>n.rule?.areaId===a.properties.areaId));
 console.log('Persistence: rollback, replay, conflict, independent rules, blocked quote, missing/outside location, authorization and summary passed');
} finally { await disconnectPrisma(); }


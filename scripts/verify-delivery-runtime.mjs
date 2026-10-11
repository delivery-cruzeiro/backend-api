import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { prisma, disconnectPrisma } from '../dist/lib/prisma.js';
import { DeliveryAreaService } from '../dist/services/delivery-area.service.js';
import { StoreShippingService } from '../dist/services/store-shipping.service.js';
try {
 const pkg = JSON.parse(await readFile('node_modules/@delivery-cruzeiro/types/package.json', 'utf8'));
 assert.equal(pkg.version, '1.3.2');
 const store = await prisma.store.findFirst(); assert.ok(store);
 const map = await new DeliveryAreaService().map(store.id);
 assert.ok(map.features.length >= 60);
 const summary = await new StoreShippingService().getSummary({storeId:store.id});
 assert.ok(summary);
 console.log(JSON.stringify({types:pkg.version, mapFeatures:map.features.length, publishedAreas:map.features.filter(f=>f.properties.areaId).length, summary:'OK'}));
} finally {await disconnectPrisma();}


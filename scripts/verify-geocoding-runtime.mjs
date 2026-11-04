import assert from 'node:assert/strict';
import {prisma,disconnectPrisma} from '../dist/lib/prisma.js';
import {geocodeAddress} from '../dist/services/postal-code-geocoding.service.js';
import {closeNominatimQueue} from '../dist/lib/nominatim-request-queue.js';
try {
 const html=await (await fetch('http://delivery-web:8080/')).text();
 const asset=html.match(/src="([^"]+\.js)"/)[1].replace('/_apps/delivery-web','');
 const bundle=await(await fetch('http://delivery-web:8080'+asset)).text();
 assert.ok(!bundle.includes('Confirme o local da entrega'));
 assert.ok(!bundle.includes('Marcar centro do mapa'));
 assert.ok(bundle.includes('OpenStreetMap contributors'));
 await prisma.address.findFirst({select:{geocodingKey:true,geocodingAttemptedAt:true}});
 console.log('PASS served checkout: manual map absent; geocoding schema available');
 const result=await geocodeAddress('01310200',1578);
 assert.equal(result.status,'found');console.log('PASS live Nominatim: CEP + number entry point resolved public address through the shared queue');
 assert.equal((await fetch('http://127.0.0.1:4000/health')).status,200);
} finally {await closeNominatimQueue();await disconnectPrisma();}

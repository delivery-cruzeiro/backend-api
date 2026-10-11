import assert from 'node:assert/strict';
import {prisma,disconnectPrisma} from '../dist/lib/prisma.js';
import {AddressGeocodingService} from '../dist/services/address-geocoding.service.js';
try {
 const html=await (await fetch('http://delivery-web:8080/')).text();
 const asset=html.match(/src="([^"]+\.js)"/)[1].replace('/_apps/delivery-web','');
 const bundle=await(await fetch('http://delivery-web:8080'+asset)).text();
 assert.ok(!bundle.includes('Confirme o local da entrega'));
 assert.ok(!bundle.includes('Marcar centro do mapa'));
 await prisma.address.findFirst({select:{geocodingKey:true,geocodingAttemptedAt:true}});
 console.log('PASS served checkout: manual map absent; geocoding schema available');
 const point=await new AddressGeocodingService().locate({street:'Avenida Paulista',number:'1578',zipCode:'01310200',city:'São Paulo',state:'SP',neighborhood:'Bela Vista'});
 assert.ok(point);console.log('PASS live provider: public address resolved with postcode and house number');
 assert.equal((await fetch('http://127.0.0.1:4000/health')).status,200);
} finally {await disconnectPrisma();}

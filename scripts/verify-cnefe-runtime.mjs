import assert from 'node:assert/strict';
import { prisma,disconnectPrisma } from '../dist/lib/prisma.js';
import { closeNominatimQueue } from '../dist/lib/nominatim-request-queue.js';
import { CnefeGeocodingProvider } from '../dist/services/geocoding/cnefe-geocoding.provider.js';
import { StoreShippingService } from '../dist/services/store-shipping.service.js';
import { normalizeDeliveryName } from '@delivery-cruzeiro/types';

// Real quotations and legitimate geocoding cache only. No orders/rules/fixtures written.
try {
  const dataset=await prisma.cnefeDataset.findFirst({where:{active:true}});assert.ok(dataset);
  const part=await prisma.deliveryPartition.findFirst({include:{neighborhood:true}});assert.ok(part);
  const storeAddresses=new Set((await prisma.store.findMany({select:{addressId:true}})).map(s=>s.addressId));
  const addresses=(await prisma.address.findMany({where:{zipCodeValidated:true,city:{equals:part.neighborhood.city,mode:'insensitive'}}}))
    .filter(a=>!storeAddresses.has(a.id)&&normalizeDeliveryName(a.neighborhood)===normalizeDeliveryName(part.neighborhood.name));
  const provider=new CnefeGeocodingProvider();
  const shipping=new StoreShippingService();
  const originalFetch=globalThis.fetch;let externalRequests=0;
  globalThis.fetch=async(...args)=>{if(new URL(args[0]).hostname==='nominatim.openstreetmap.org')externalRequests++;return originalFetch(...args);};
  const output=[];
  try {
    for (const [index,address] of addresses.entries()) {
      const local=await provider.locate(address);
      const before=externalRequests;
      const input={storeId:part.storeId,addressId:address.id,neighborhood:address.neighborhood,city:address.city,state:address.state};
      const quote=await shipping.resolveShippingQuote(input);
      const saved=await prisma.address.findUnique({where:{id:address.id}});
      if(local.status==='found') {
        assert.equal(saved.geocodingSource,'IBGE_CNEFE');assert.ok(quote.areaId);assert.equal(externalRequests,before);
        const repeated=await shipping.resolveShippingQuote(input);assert.equal(repeated.areaId,quote.areaId);assert.equal(repeated.value,quote.value);
        assert.equal(externalRequests,before);
      }
      output.push({sample:index+1,localStatus:local.status,area:quote.areaSnapshot?.name??null,
        isAvailable:quote.isAvailable,needsLocation:quote.needsLocation??false,value:quote.value,
        source:saved.geocodingSource,uncertaintyMeters:saved.geocodingQuality?.uncertaintyMeters??null,
        externalRequests:externalRequests-before});
    }
  } finally {globalThis.fetch=originalFetch;}
  const html=await(await fetch('http://delivery-web:8080/')).text();
  const asset=html.match(/src="([^"]+\.js)"/)[1].replace('/_apps/delivery-web','');
  const bundle=await(await fetch('http://delivery-web:8080'+asset)).text();
  assert.ok(bundle.includes('IBGE/CNEFE'));assert.ok(!bundle.includes('Confirme o local da entrega'));
  assert.equal((await fetch('http://127.0.0.1:4000/health')).status,200);
  console.log(JSON.stringify({result:'PASS',referenceRecords:dataset.recordCount,version:dataset.version,quotations:output,
    servedCheckout:'IBGE + OSM attribution, no manual map'}));
} finally {await closeNominatimQueue();await disconnectPrisma();}

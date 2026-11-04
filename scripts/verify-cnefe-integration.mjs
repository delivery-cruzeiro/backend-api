import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { Client } from 'pg';
import Fastify from 'fastify';
import { prisma, disconnectPrisma } from '../dist/lib/prisma.js';
import { closeNominatimQueue } from '../dist/lib/nominatim-request-queue.js';
import { CnefeGeocodingProvider } from '../dist/services/geocoding/cnefe-geocoding.provider.js';
import { FallbackGeocodingProvider } from '../dist/services/geocoding/fallback-geocoding.provider.js';
import { AddressGeocodingService } from '../dist/services/address-geocoding.service.js';
import { DeliveryAreaService } from '../dist/services/delivery-area.service.js';
import { StoreShippingService } from '../dist/services/store-shipping.service.js';
import { ClientOrderService } from '../dist/services/client-order.service.js';
import { PrismaClientOrderRepository } from '../dist/repositories/order.repository.js';
import { getClientShippingQuote } from '../dist/controllers/client.controller.js';
import { normalizeDeliveryName } from '@delivery-cruzeiro/types';

if (!process.env.DATABASE_URL?.includes('dc-geocoding-postgres')) throw Error('Isolated restored database required');
const originalFetch=globalThis.fetch;
try {
  const dataset=await prisma.cnefeDataset.findFirst({where:{active:true}});assert.ok(dataset);
  const local=new CnefeGeocodingProvider();
  const partition=await prisma.deliveryPartition.findFirst({include:{neighborhood:true,revisions:{include:{areas:true}}}});assert.ok(partition);
  const ref=partition.neighborhood;
  const stores=await prisma.store.findMany({select:{addressId:true}});
  const storeAddresses=new Set(stores.map(s=>s.addressId));
  const addresses=(await prisma.address.findMany({where:{zipCodeValidated:true,city:{equals:ref.city,mode:'insensitive'}}}))
    .filter(a=>!storeAddresses.has(a.id)&&normalizeDeliveryName(a.neighborhood)===normalizeDeliveryName(ref.name));
  let address,point,spatial,missing;
  for (const candidate of addresses) {
    const found=await local.locate(candidate);
    if (found.status==='found') {
      address=candidate;point=found;
      spatial=await new DeliveryAreaService().resolve({...candidate,storeId:partition.storeId,...found.point,
        locationConfirmed:true,locationAccuracyMeters:found.quality.uncertaintyMeters});
    } else missing=candidate;
  }
  assert.ok(address&&point&&spatial&&!spatial.needsLocation);assert.ok(missing);
  let requests=0;
  globalThis.fetch=async url=>{assert.equal(new URL(url).hostname,'nominatim.openstreetmap.org');requests++;return new Response('[]');};
  const shipping=new StoreShippingService();
  await shipping.upsertNeighborhoodShipping({storeId:partition.storeId,areaId:spatial.area.id,neighborhood:spatial.area.name,
    mode:'MANUAL',value:12,shippingTime:40,isBlocked:false});
  const app=Fastify();
  app.get('/client/shipping-quote',{preHandler:async request=>{request.user={id:address.userId};}},getClientShippingQuote);
  try {
    const quote=await app.inject({method:'GET',url:'/client/shipping-quote?'+new URLSearchParams({storeId:partition.storeId,addressId:address.id})});
    assert.equal(quote.statusCode,200);assert.equal(quote.json().areaId,spatial.area.id);assert.equal(quote.json().value,12);
  } finally {await app.close();}
  assert.equal(requests,0,'Covered CNEFE address must not call the external geocoder');
  const saved=await prisma.address.findUnique({where:{id:address.id}});
  assert.equal(saved.geocodingSource,'IBGE_CNEFE');assert.ok(saved.geocodingSourceVersion.includes(dataset.checksum));
  assert.ok(saved.geocodingQuality.uncertaintyMeters>=30);
  const product=await prisma.product.findFirst({where:{isActive:true,stores:{some:{id:partition.storeId}}}});assert.ok(product);
  const dto={storeId:partition.storeId,addressId:address.id,paymentType:'CASH',items:[{productId:product.id,quantity:1}]};
  const prepared=await new ClientOrderService().prepareOrder(address.userId,dto);
  assert.equal(prepared.success,true,prepared.error);assert.equal(prepared.data.deliveryAreaId,spatial.area.id);assert.equal(prepared.data.deliveryFee,12);
  const order=await new PrismaClientOrderRepository().createClientOrder(prepared.data);
  assert.equal(requests,0);
  await shipping.upsertNeighborhoodShipping({storeId:partition.storeId,areaId:spatial.area.id,neighborhood:spatial.area.name,
    mode:'MANUAL',value:27,shippingTime:60,isBlocked:true});
  assert.equal((await new ClientOrderService().prepareOrder(address.userId,dto)).success,false);
  assert.equal(Number((await prisma.order.findUnique({where:{id:order.id}})).deliveryFee),12);

  // Exercise the actual uncertainty guard and fallback against a real shared cut.
  const active=partition.revisions.find(r=>r.revision===partition.activeRevision).areas;
  const vertices=geometry=>geometry.coordinates.flat(geometry.type==='Polygon'?1:2);
  const one=vertices(active[0].geometry),other=new Set(vertices(active[1].geometry).map(p=>p.join(',')));
  const shared=one.filter(p=>other.has(p.join(',')));assert.ok(shared.length>=2);
  const cut={longitude:(shared[0][0]+shared[1][0])/2,latitude:(shared[0][1]+shared[1][1])/2};
  let fallbackCalls=0;
  const chain=new FallbackGeocodingProvider([
    {cacheKey:'boundary-local',locate:async()=>({...point,point:cut})},
    {cacheKey:'precise-fallback',locate:async()=>{fallbackCalls++;return {status:'found',point:point.point,source:'NOMINATIM',sourceVersion:'fixture'};}},
  ]);
  const located=await new AddressGeocodingService(chain).ensureLocation(address.id,{scope:'boundary-probe',accept:async location=>{
    const result=await new DeliveryAreaService().resolve({...address,...location,storeId:partition.storeId});
    return !!result&&!result.needsLocation;
  }});
  assert.equal(located.locationConfirmed,true);assert.equal(fallbackCalls,1);

  await prisma.address.update({where:{id:missing.id},data:{geocodingKey:null,geocodingAttemptedAt:null}});
  const unresolved=await shipping.resolveShippingQuote({storeId:partition.storeId,addressId:missing.id,
    city:missing.city,state:missing.state,neighborhood:missing.neighborhood});
  assert.equal(unresolved.needsLocation,true);assert.equal(unresolved.isAvailable,false);assert.equal(requests,1);

  const admin=new Client({connectionString:process.env.DATABASE_URL});await admin.connect();
  try {
    await admin.query('BEGIN');await admin.query('SET LOCAL ROLE delivery_app');
    assert.ok(Number((await admin.query('SELECT count(*) FROM cnefe_addresses')).rows[0].count)>0);
    await assert.rejects(admin.query("UPDATE cnefe_datasets SET active=false"),e=>e.code==='42501');
    await admin.query('ROLLBACK');
    assert.equal((await admin.query("SELECT has_table_privilege('delivery_app','cnefe_addresses','TRUNCATE') AS allowed")).rows[0].allowed,false);
    // Fail after inserting a staged row; the active dataset and its count must survive.
    const csv='COD_UNICO_ENDERECO;COD_MUNICIPIO;CEP;NOM_TIPO_SEGLOGR;NOM_TITULO_SEGLOGR;NOM_SEGLOGR;NUM_ENDERECO;DSC_MODIFICADOR;LATITUDE;LONGITUDE;NV_GEO_COORD\nfixture;2504009;58414000;Rua;;Fixture;12;;-7.24;-35.88;1\n';
    const manifest={municipalityCode:'2504009',city:ref.city,state:ref.state,version:'rollback-fixture',referenceYear:2022,
      source:dataset.sourceUrl,csvSha256:createHash('sha256').update(csv).digest('hex'),expectedRecords:2};
    await writeFile('/tmp/cnefe-fixture.csv',csv);await writeFile('/tmp/cnefe-fixture.json',JSON.stringify(manifest));
    const failed=spawnSync(process.execPath,['scripts/import-cnefe.mjs','--csv','/tmp/cnefe-fixture.csv','--manifest','/tmp/cnefe-fixture.json'],{encoding:'utf8'});
    assert.notEqual(failed.status,0);assert.ok(failed.stderr.includes('Unexpected CNEFE record count'));
    const after=await prisma.cnefeDataset.findMany();assert.equal(after.length,1);assert.equal(after[0].id,dataset.id);assert.equal(after[0].active,true);
    assert.equal(await prisma.cnefeAddress.count(),dataset.recordCount);
  } finally {await admin.end();}
  console.log(JSON.stringify({result:'PASS',localReferenceRecords:dataset.recordCount,externalCallsForCoveredAddress:0,
    verified:['real quotation controller','actual order','persisted provenance and quality','immutable fee','blocked area',
      'near-cut fallback','remaining coverage gap','runtime read-only source','failed import rollback']}));
} finally {globalThis.fetch=originalFetch;await closeNominatimQueue();await disconnectPrisma();}

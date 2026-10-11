import assert from 'node:assert/strict';
import { Client } from 'pg';
import { deliveryGeometryCovers } from '@delivery-cruzeiro/types';
import { prisma, disconnectPrisma } from '../dist/lib/prisma.js';
import { ClientOrderService } from '../dist/services/client-order.service.js';
import { PrismaClientOrderRepository } from '../dist/repositories/order.repository.js';
import { StoreShippingService } from '../dist/services/store-shipping.service.js';
if (!process.env.DATABASE_URL?.includes('dc-geocoding-postgres')) throw Error('Isolated database required');
try {
 const area=await prisma.deliveryArea.findFirst({include:{revision:{include:{partition:{include:{neighborhood:true}}}}}});assert.ok(area);
 const ref=area.revision.partition.neighborhood;
 const poly=area.geometry.coordinates[0];const ring=poly[0];const xs=ring.map(p=>p[0]),ys=ring.map(p=>p[1]);let point;
 for(let i=1;i<30&&!point;i++)for(let j=1;j<30&&!point;j++){const p=[Math.min(...xs)+(Math.max(...xs)-Math.min(...xs))*i/30,Math.min(...ys)+(Math.max(...ys)-Math.min(...ys))*j/30];if(deliveryGeometryCovers(area.geometry,p))point=p;}
 assert.ok(point);
 const store=await prisma.store.findUnique({where:{id:area.storeId}});
 const address=await prisma.address.findFirst({where:{id:{not:store.addressId}}});assert.ok(address);
 await prisma.address.update({where:{id:address.id},data:{city:ref.city,state:ref.state,neighborhood:ref.name,street:"Rua de Teste",number:"12",zipCode:"58414000",latitude:null,longitude:null,locationConfirmed:false,geocodingKey:null,geocodingAttemptedAt:null,zipCodeValidated:true}});
 let requests = 0;
 const originalFetch = globalThis.fetch;
 globalThis.fetch = async (url) => {
  assert.equal(new URL(url).hostname, 'photon.komoot.io'); requests++;
  return new Response(JSON.stringify({features:[{type:'Feature',geometry:{type:'Point',coordinates:point},properties:{housenumber:'12',street:'Rua de Teste',postcode:'58414000',city:ref.city,countrycode:'BR'}}]}));
 };
 const quote = await new StoreShippingService().resolveShippingQuote({storeId:area.storeId,addressId:address.id,neighborhood:ref.name,city:ref.city,state:ref.state});
 assert.equal(quote.areaId,area.id);
 const located=await prisma.address.findUnique({where:{id:address.id}});assert.equal(located.locationConfirmed,true);assert.ok(located.geocodingKey);
 const product=await prisma.product.findFirst({where:{isActive:true,stores:{some:{id:area.storeId}}}});assert.ok(product);
 const shipping=new StoreShippingService();
 await shipping.upsertNeighborhoodShipping({storeId:area.storeId,areaId:area.id,neighborhood:area.name,mode:'MANUAL',value:12,shippingTime:48,isBlocked:false});
 const service=new ClientOrderService();
 const dto={storeId:area.storeId,addressId:address.id,paymentType:'CASH',items:[{productId:product.id,quantity:1}]};
 const prepared=await service.prepareOrder(address.userId,dto);assert.equal(prepared.success,true,prepared.error);
 assert.equal(prepared.data.deliveryFee,12);assert.equal(prepared.data.deliveryAreaId,area.id);
 const order=await new PrismaClientOrderRepository().createClientOrder(prepared.data);
 await shipping.upsertNeighborhoodShipping({storeId:area.storeId,areaId:area.id,neighborhood:area.name,mode:'MANUAL',value:29,shippingTime:70,isBlocked:true});
 const saved=await prisma.order.findUnique({where:{id:order.id}});assert.equal(Number(saved.deliveryFee),12);assert.equal(saved.deliveryAreaSnapshot.shippingTime,48);assert.equal(saved.deliveryAreaSnapshot.value,12);
 assert.equal((await service.prepareOrder(address.userId,dto)).success,false);
 assert.equal(requests,1,'Quotation and order should reuse persisted geocoding'); globalThis.fetch=originalFetch;
 const connection=new Client({connectionString:process.env.DATABASE_URL});await connection.connect();
 try{
 await connection.query('BEGIN');await connection.query('SET LOCAL ROLE delivery_app');
 await connection.query("SELECT set_config('app.kind','user',true), set_config('app.role','MANAGER',true), set_config('app.user_id','unauthorized',true)");
 await assert.rejects(connection.query('INSERT INTO delivery_partitions(id,store_id,neighborhood_id) VALUES(gen_random_uuid(),$1,$2)',[area.storeId,ref.id]),e=>e.code==='42501');
 await connection.query('ROLLBACK');
 }finally{await connection.end();}
 console.log('PASS: automatic geocoding + quotation + actual order using the same persisted area; immutable snapshot after fee change; blocked checkout; PostgreSQL RLS rejects unauthorized store write');
}finally{await disconnectPrisma();}


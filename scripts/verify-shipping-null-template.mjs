// Tests the actual controller and database inside a transaction that always rolls back.
import assert from 'node:assert/strict';

import { prisma, disconnectPrisma } from '../dist/lib/prisma.js';
import { upsertStoreNeighborhoodShipping } from '../dist/controllers/store-shipping.controller.js';


const payload = {areaId:'d0206578-8b08-425a-94ce-aa902faf7768',createTemplate:false,isBlocked:true,mode:'MANUAL',neighborhood:'Liberdade-1',shippingTime:30,storeId:'fe8215f0-e578-4cca-a9b4-4d8c7fd7f473',templateName:null,value:12};
const rollback = new Error('intentional rollback');
try {
 const before = await prisma.storeNeighborhoodShipping.findMany({where:{storeId:payload.storeId},orderBy:{id:'asc'}});
 assert.ok(before.some(r=>r.areaId===payload.areaId), 'Expected existing subdivision');
 try {
  await prisma.$transaction(async()=>{
   for(const isBlocked of [true,false]) {
    const response = {statusCode:200,body:null,status(code){this.statusCode=code;return this;},send(body){this.body=body;return this;}};
    await upsertStoreNeighborhoodShipping({body:{...payload,isBlocked}},response);
    assert.equal(response.statusCode,200,JSON.stringify(response.body));
    const saved=await prisma.storeNeighborhoodShipping.findUnique({where:{areaId:payload.areaId}});
    assert.equal(saved.isBlocked,isBlocked);assert.equal(saved.shippingTime,30);assert.equal(Number(saved.value),12);
   }
   throw rollback;
  });
 } catch(error) {if(error!==rollback)throw error;}
 const after=await prisma.storeNeighborhoodShipping.findMany({where:{storeId:payload.storeId},orderBy:{id:'asc'}});
 assert.deepEqual(after,before);
 console.log('PASS: actual controller accepts manual null templateName; block/unblock and values read back from database; all settings unchanged after rollback');
} finally {await disconnectPrisma();}


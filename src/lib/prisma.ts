import 'dotenv/config';
import { AsyncLocalStorage } from 'node:async_hooks';
import { PrismaClient, Prisma } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

import { currentDatabaseIdentity } from '../security/database-context.js';
import { encryptData, decryptResult } from '../security/encryption.js';

const client = new PrismaClient({adapter:new PrismaPg({connectionString:process.env.DATABASE_URL})});
const transactions = new AsyncLocalStorage<Prisma.TransactionClient>();
async function transaction<T>(fn:(tx:Prisma.TransactionClient)=>Promise<T>) {
 const active=transactions.getStore();
 if(active) return fn(active);
 const identity=currentDatabaseIdentity();
 return client.$transaction(async tx=>{
  // Parameterized security context, never interpolated business SQL.
  await tx.$executeRaw`SELECT set_config('app.user_id', ${identity.userId || ''}, true), set_config('app.role', ${identity.role || ''}, true), set_config('app.kind', ${identity.kind}, true)`;
  return transactions.run(tx,()=>fn(tx));
 },{maxWait:10000,timeout:30000});
}
const delegates=new Map<string,unknown>();
export const prisma: PrismaClient = new Proxy(client,{
 get(target,property){
  if(property==='$transaction') return (fn:unknown)=>{
   if(typeof fn!=='function') throw new Error('Use callback transactions to preserve security context');
   return transaction(()=>fn(prisma));
  };
  if(typeof property!=='string') return Reflect.get(target,property);
  if(property.startsWith('$')) {
   if(['$queryRaw','$executeRaw','$queryRawUnsafe','$executeRawUnsafe'].includes(property)) throw new Error('Business database access must use ORM delegates');
   const value=Reflect.get(target,property); return typeof value==='function'?value.bind(target):value;
  }
  const model=Prisma.dmmf.datamodel.models.find(item=>item.name[0].toLowerCase()+item.name.slice(1)===property);
  if(!model) return Reflect.get(target,property);
  if(!delegates.has(property)) delegates.set(property,new Proxy({}, {
   get(_delegate,operation){
    return (args:Record<string,unknown>={})=>transaction(async tx=>{
     const input={...args};
     for(const field of ['data','create','update']) if(input[field]) input[field]=encryptData(model.name,input[field]);
     const delegate=Reflect.get(tx,property);
     const result=await Reflect.get(delegate,operation).call(delegate,input);
     return decryptResult(result);
    });
   }
  }));
  return delegates.get(property);
 }
});
export async function disconnectPrisma(){await client.$disconnect();}
export async function assertDatabaseSecurity(){
 if(process.env.NODE_ENV!=='production') return;
 const roles=await client.$queryRaw<Array<{rolname:string;rolsuper:boolean;rolbypassrls:boolean}>>`SELECT rolname,rolsuper,rolbypassrls FROM pg_roles WHERE rolname=current_user`;
 if(roles[0]?.rolname!=='delivery_app' || roles[0].rolsuper || roles[0].rolbypassrls) throw new Error('Runtime database credentials must use the restricted delivery_app role');
}

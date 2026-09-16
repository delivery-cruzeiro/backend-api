// Run only against a disposable environment. Creates synthetic test accounts.
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {prisma, disconnectPrisma} from '../dist/lib/prisma.js';
import {databaseIdentity} from '../dist/security/database-context.js';
import pg from 'pg';
const base=process.env.SECURITY_TEST_URL || 'http://127.0.0.1:4000';
const suffix=randomUUID(), password='Synthetic-test-password-42!';
async function request(path, body, cookie, headers={}) {
 const response=await fetch(base+path,{method:body===undefined?'GET':'POST',headers:{origin:process.env.PUBLIC_URL,...(body===undefined?{}:{'content-type':'application/json'}),...(cookie?{cookie}:{}),...headers},body:body===undefined?undefined:JSON.stringify(body)});
 const text=await response.text(); let data; try{data=JSON.parse(text);}catch{data=text;}
 return {status:response.status,data,headers:response.headers};
}
const check=(label)=>console.log('PASS '+label);
const users=[];
try {
 for(const index of [1,2]) {
  const email=`security-${suffix}-${index}@example.test`;
  const result=await request('/api/auth/register',{email,password,name:'Security test',phone:'31999999999'});
  assert.equal(result.status,201,JSON.stringify(result.data));
  users.push({...result.data.user,email});
 }
 const a=users[0], b=users[1];
 let login=await request('/api/auth/login',{email:a.email,password});
 assert.equal(login.status,200,JSON.stringify(login.data));
 assert.ok(!JSON.stringify(login.data).includes('"token"'));
 const setCookie=login.headers.get('set-cookie');
 assert.match(setCookie,/HttpOnly/i); assert.match(setCookie,/SameSite=Lax/i);
 const cookie=setCookie.split(';')[0];
 assert.equal((await request('/api/auth/me',undefined,cookie)).status,200);
 assert.equal((await request('/api/auth/logout',{},cookie)).status,200);
 assert.equal((await request('/api/auth/me',undefined,cookie)).status,401);
 check('cookie flags, minimal login response and immediate logout revocation');
 const bad=await request('/api/auth/login',{email:a.email,password:'incorrect-password'});
 const absent=await request('/api/auth/login',{email:`absent-${suffix}@example.test`,password});
 await prisma.user.update({where:{id:b.id},data:{isActive:false}});
 const disabled=await request('/api/auth/login',{email:b.email,password});
 for(const result of [bad,absent,disabled]) assert.equal(result.status,401);
 assert.deepEqual(bad.data,absent.data); assert.deepEqual(bad.data,disabled.data);
 assert.equal(disabled.headers.get('set-cookie'),null);
 check('identical errors for wrong password, missing and disabled accounts');
 const attempts=await Promise.all(Array.from({length:7},()=>request('/api/auth/login',{email:`limited-${suffix}@example.test`,password})));
 assert.equal(attempts.filter(x=>x.status===401).length,6);
 assert.equal(attempts.filter(x=>x.status===429).length,1);
 check('six attempts per IP/account under concurrent requests');
 assert.equal((await request('/health',undefined,undefined,{origin:'https://evil.example'})).status,403);
 assert.equal((await request('/health?access%5Ftoken=unsafe')).status,400);
 assert.equal((await request('/api/auth/sign-in/email',{email:a.email,password})).status,404);
 const mass=await request('/api/auth/register',{email:`mass-${suffix}@example.test`,password,name:'test',role:'SUPER_ADMIN'});
 assert.equal(mass.status,400);
 assert.equal((await request('/api/newMatch',{match:'br-no',result:'br(1)-no(0)'})).status,401);
 check('CORS, URL credentials, auth bypass and privileged public writes blocked');
 const asUser=(user,fn)=>databaseIdentity.run({kind:'user',userId:user.id,role:'CLIENT'},fn);
 const address=await asUser(a,()=>prisma.address.create({data:{userId:a.id,street:'Test',number:'1',neighborhood:'Test',city:'Test',state:'MG',zipCode:'00000000'}}));
 assert.equal(await asUser(a,()=>prisma.address.count({where:{id:address.id}})),1);
 assert.equal(await asUser(b,()=>prisma.address.count({where:{id:address.id}})),0);
 assert.equal((await asUser(b,()=>prisma.address.updateMany({where:{id:address.id},data:{number:'2'}}))).count,0);
 const counts=await Promise.all([asUser(a,()=>prisma.address.count({where:{id:address.id}})),asUser(b,()=>prisma.address.count({where:{id:address.id}}))]);
 assert.deepEqual(counts,[1,0]);
 assert.equal(await prisma.address.count({where:{id:address.id}}),1);
 assert.equal((await prisma.user.findUnique({where:{id:a.id}})).phone,'31999999999');
 const raw=new pg.Client({connectionString:process.env.DATABASE_URL});
 await raw.connect();
 try {
  const stored=await raw.query('SELECT phone FROM "User" WHERE id=$1',[a.id]);
  assert.match(stored.rows[0].phone,/^enc:v1:/);
  assert.ok(!stored.rows[0].phone.includes('31999999999'));
  const role=await raw.query('SELECT rolsuper,rolbypassrls FROM pg_roles WHERE rolname=current_user');
  assert.deepEqual(role.rows[0],{rolsuper:false,rolbypassrls:false});
  const tables=await raw.query("SELECT count(*)::int AS count FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind='r' AND c.relname<>'_prisma_migrations' AND (NOT c.relrowsecurity OR NOT c.relforcerowsecurity)");
  assert.equal(tables.rows[0].count,0);
 } finally {await raw.end();}
 check('RLS ownership, concurrent identity isolation and transparent decryption');
 const handshake=await fetch(base+'/socket.io/?EIO=4&transport=polling');
 const sid=JSON.parse((await handshake.text()).slice(1)).sid;
 await fetch(base+`/socket.io/?EIO=4&transport=polling&sid=${sid}`,{method:'POST',body:'40',headers:{'content-type':'text/plain'}});
 const rejected=await fetch(base+`/socket.io/?EIO=4&transport=polling&sid=${sid}`);
 assert.match(await rejected.text(),/44/);
 check('anonymous Socket.IO connection rejected');
 console.log('Security integration checks completed.');
} finally {
 for(const user of users) await prisma.user.delete({where:{id:user.id}});
 await disconnectPrisma();
}

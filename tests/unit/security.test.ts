import {afterEach,describe,expect,it,vi} from 'vitest';
import Fastify from 'fastify';
import {registerSecurityHooks,minimizeResponse} from '../../src/security/http.js';
import {securityConfig,hasUrlCredential} from '../../src/security/config.js';
import {encryptValue,decryptValue,encryptData,decryptResult} from '../../src/security/encryption.js';
import {databaseIdentity} from '../../src/security/database-context.js';
import {validateZod} from '../../src/middleware/validate-zod.middleware.js';

afterEach(()=>vi.unstubAllEnvs());
describe('HTTP security boundaries',()=>{
 it('permits exact origins and requires HTTPS outside explicit localhost mode',()=>{
  expect(()=>securityConfig({NODE_ENV:'production',PUBLIC_URL:'http://example.org'})).toThrow();
  expect(()=>securityConfig({NODE_ENV:'production',PUBLIC_URL:'http://example.org',ALLOW_INSECURE_LOCALHOST:'true'})).toThrow();
  expect(securityConfig({NODE_ENV:'production',PUBLIC_URL:'http://localhost:8080',ALLOW_INSECURE_LOCALHOST:'true',BETTER_AUTH_SECRET:'s'.repeat(32),DATA_ENCRYPTION_KEY:'ab'.repeat(32)}).secureCookies).toBe(false);
  expect(()=>securityConfig({PUBLIC_URL:'https://example.org',CORS_ORIGIN:'https://*.example.org'})).toThrow();
 });
 it('rejects encoded credential keys in URLs',()=>{
  for(const url of ['/api?token=abc','/api?%74oken=abc','/api?access_token=abc','/api?apiKey=abc']) expect(hasUrlCredential(url)).toBe(true);
  expect(hasUrlCredential('/api?storeId=abc')).toBe(false);
 });
 it('strips secrets recursively but preserves business fields',()=>{
  expect(minimizeResponse({name:' Ana ',user:{password:'hash',phone:'123'},session:{token:'abc',expiresAt:'later'}})).toEqual({name:' Ana ',user:{phone:'123'},session:{expiresAt:'later'}});
 });
 it('blocks cross-origin requests, rejects mass assignment, masks database errors and isolates concurrent request contexts',async()=>{
  vi.stubEnv('PUBLIC_URL','http://localhost:8080');
  const app=Fastify({ajv:{customOptions:{removeAdditional:false}}});
  registerSecurityHooks(app);
  app.post('/api/profile',{schema:{body:{type:'object',properties:{name:{type:'string'}},required:['name']}}},async req=>req.body);
  app.post('/api/zod',{preValidation:validateZod({safeParse:()=>({success:true as const,data:{name:'Ana'}})})},async req=>req.body);
  app.get('/api/fail',async()=>{throw new Error('Prisma SQL password=secret');});
  app.get('/api/identity/:id',async req=>{const ctx=databaseIdentity.getStore()!;ctx.userId=(req.params as {id:string}).id;await new Promise(r=>setTimeout(r,10));return {id:databaseIdentity.getStore()?.userId};});
  try {
   expect((await app.inject({method:'POST',url:'/api/profile',headers:{origin:'http://localhost:8080.attacker.test'},payload:{name:'Ana'}})).statusCode).toBe(403);
   expect((await app.inject({method:'POST',url:'/api/profile',payload:{name:'Ana',role:'ADMIN'}})).statusCode).toBe(400);
   expect((await app.inject({method:'POST',url:'/api/zod',payload:{name:'Ana',role:'ADMIN'}})).statusCode).toBe(400);
   expect((await app.inject('/api/fail')).json()).toEqual({error:'Erro interno do servidor'});
   const replies=await Promise.all(['one','two'].map(id=>app.inject('/api/identity/'+id)));
   expect(replies.map(r=>r.json().id)).toEqual(['one','two']);
  } finally {await app.close();}
 });
});
describe('field encryption',()=>{
 it('uses unique nonces, authenticates ciphertext and preserves round trips',()=>{
  vi.stubEnv('DATA_ENCRYPTION_KEY','ab'.repeat(32));
  const first=encryptValue('private phone'),second=encryptValue('private phone');
  expect(first).not.toBe(second);expect(first).not.toContain('private phone');expect(decryptValue(first)).toBe('private phone');
  const bytes=Buffer.from(first.slice(7),'base64');bytes[bytes.length-1]^=1;
  expect(()=>decryptValue('enc:v1:'+bytes.toString('base64'))).toThrow();
 });
 it('encrypts nested ORM writes and decrypts related selections',()=>{
  vi.stubEnv('DATA_ENCRYPTION_KEY','cd'.repeat(32));
  const result=encryptData('User',{phone:'123',paymentMethods:{create:{providerId:'provider-secret',cardHolder:'Ana'}}});
  expect(JSON.stringify(result)).not.toContain('provider-secret');
  expect(decryptResult(result)).toEqual({phone:'123',paymentMethods:{create:{providerId:'provider-secret',cardHolder:'Ana'}}});
 });
});

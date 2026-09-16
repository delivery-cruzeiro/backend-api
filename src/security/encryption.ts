import {createCipheriv, createDecipheriv, randomBytes} from 'node:crypto';
import {Prisma} from '@prisma/client';
const prefix = 'enc:v1:';
function key() {
 const value = process.env.DATA_ENCRYPTION_KEY || '';
 if (!/^[a-f0-9]{64}$/i.test(value)) throw new Error('DATA_ENCRYPTION_KEY must contain 32 random bytes in hex');
 return Buffer.from(value,'hex');
}
export function encryptValue(value: string) {
 const iv=randomBytes(12), cipher=createCipheriv('aes-256-gcm',key(),iv);
 const encrypted=Buffer.concat([cipher.update(value,'utf8'),cipher.final()]);
 return prefix+Buffer.concat([iv,cipher.getAuthTag(),encrypted]).toString('base64');
}
export function decryptValue(value: string) {
 if (!value.startsWith(prefix)) return value;
 const bytes=Buffer.from(value.slice(prefix.length),'base64');
 const decipher=createDecipheriv('aes-256-gcm',key(),bytes.subarray(0,12));
 decipher.setAuthTag(bytes.subarray(12,28));
 return Buffer.concat([decipher.update(bytes.subarray(28)),decipher.final()]).toString('utf8');
}
const fields:Record<string,Set<string>> = {
 User:new Set(['phone']), Account:new Set(['accessToken','refreshToken','idToken']),
 PaymentMethod:new Set(['providerId','cardHolder']), FiscalDocument:new Set(['xmlContent']),
};
export function encryptData(model: string, value: unknown): unknown {
 if (Array.isArray(value)) return value.map(x=>encryptData(model,x));
 if (!value || typeof value!=='object') return value;
 return Object.fromEntries(Object.entries(value).map(([field,item])=>{
  if (fields[model]?.has(field)) {
   if (typeof item==='string') return [field,encryptValue(item)];
   if (item && typeof item==='object' && 'set' in item && typeof item.set==='string') return [field,{set:encryptValue(item.set)}];
  }
  const relation = Prisma.dmmf.datamodel.models.find(x=>x.name===model)?.fields.find(x=>x.name===field && x.kind==='object');
  if (relation) return [field,encryptData(relation.type,item)];
  if (['create','update','upsert','createMany','updateMany','data'].includes(field)) return [field,encryptData(model,item)];
  return [field,item];
 }));
}
export function decryptResult(value: unknown): unknown {
 if (typeof value==='string') return decryptValue(value);
 if (Array.isArray(value)) return value.map(decryptResult);
 if (!value || typeof value!=='object' || value instanceof Date || Buffer.isBuffer(value) || Object.getPrototypeOf(value)!==Object.prototype) return value;
 return Object.fromEntries(Object.entries(value).map(([field,item])=>[field,decryptResult(item)]));
}

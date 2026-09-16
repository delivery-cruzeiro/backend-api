import { AsyncLocalStorage } from 'node:async_hooks';
export type DatabaseIdentity = {kind:'anonymous'|'user'|'system'; userId?:string; role?:string};
export const databaseIdentity = new AsyncLocalStorage<DatabaseIdentity>();
export function currentDatabaseIdentity(): DatabaseIdentity {
 return databaseIdentity.getStore() ?? {kind:'system'};
}

// Run only against a disposable database. Creates synthetic users and changes roles.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { prisma, disconnectPrisma } from '../dist/lib/prisma.js';

if (process.env.DISPOSABLE_PERMISSION_TEST !== 'true') throw new Error('A disposable database is required');
const base = 'http://127.0.0.1:4000';
const password = 'Permissions-test-password-42!';
const suffix = randomUUID();
async function request(path, body, cookie, method = body === undefined ? 'GET' : 'POST') {
  const response = await fetch(base + path, {
    method,
    headers: { origin: process.env.PUBLIC_URL, ...(body === undefined ? {} : { 'content-type': 'application/json' }), ...(cookie ? { cookie } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: response.status, data: await response.json(), cookie: response.headers.getSetCookie().map(value => value.split(';')[0]).join('; ') };
}
try {
  const registration = { email: `permissions-${suffix}@example.test`, name: 'Prefix Person', password, phone: '11999999999' };
  assert.equal((await request('/api/auth/register', { ...registration, phone: undefined })).status, 400);
  assert.equal((await request('/api/auth/register', { ...registration, cpf: '11111111111' })).status, 400);
  const nullable = await request('/api/auth/register', { ...registration, email: `nullable-${suffix}@example.test`, name: 'Other Prefix', cpf: null });
  assert.equal(nullable.status, 201, JSON.stringify(nullable.data));
  const registered = await request('/api/auth/register', { ...registration, cpf: '529.982.247-25' });
  assert.equal(registered.status, 201, JSON.stringify(registered.data));
  const id = registered.data.user.id;
  assert.equal((await prisma.user.findUnique({ where: { id } })).cpf, '52998224725');
  const client = await request('/api/auth/login', { email: registration.email, password });
  assert.equal(client.status, 200);
  assert.equal((await request('/api/users?search=Pre', undefined, client.cookie)).status, 403);
  assert.equal((await request('/api/users?staff=true')).status, 401);
  const admin = await request('/api/auth/login', { email: process.env.DEFAULT_ADMIN_EMAIL, password: process.env.DEFAULT_ADMIN_PASSWORD });
  assert.equal(admin.status, 200, JSON.stringify(admin.data));
  assert.equal((await request('/api/users?search=Pr', undefined, admin.cookie)).status, 400);
  const nameSearch = await request('/api/users?search=pre', undefined, admin.cookie);
  assert.deepEqual(nameSearch.data.users.map(user => user.id), [id]);
  const cpfSearch = await request('/api/users?search=529.9', undefined, admin.cookie);
  assert.deepEqual(cpfSearch.data.users.map(user => user.id), [id]);
  assert.equal(cpfSearch.data.users[0].cpf, undefined, 'Search results do not expose CPF');
  assert.equal((await request(`/api/users/${id}`, { role: 'MANAGER' }, admin.cookie, 'PUT')).status, 400);
  const store = await prisma.store.findFirst();
  assert.ok(store, 'Initial migration must provide a store');
  const promoted = await request(`/api/users/${id}`, { role: 'MANAGER', storeIds: [store.id] }, admin.cookie, 'PUT');
  assert.equal(promoted.status, 200, JSON.stringify(promoted.data));
  assert.equal(promoted.data.user.role, 'MANAGER');
  const staff = await request('/api/users?staff=true&page=1', undefined, admin.cookie);
  assert.ok(staff.data.users.some(user => user.id === id));
  assert.ok(staff.data.users.every(user => user.role !== 'CLIENT'));
  const elevated = await request(`/api/users/${id}`, { role: 'SUPER_ADMIN' }, admin.cookie, 'PUT');
  assert.equal(elevated.status, 200, JSON.stringify(elevated.data));
  assert.equal(elevated.data.user.role, 'SUPER_ADMIN');
  const changed = await request(`/api/users/${id}`, { role: 'ADMIN' }, client.cookie, 'PUT');
  assert.equal(changed.status, 200);
  assert.equal(changed.data.user.role, 'ADMIN');
  const demoted = await request(`/api/users/${id}`, { role: 'CLIENT' }, client.cookie, 'PUT');
  assert.equal(demoted.status, 200);
  assert.equal(demoted.data.user.role, 'CLIENT');
  assert.deepEqual(demoted.data.user.stores, []);
  assert.equal((await request('/api/users?staff=true', undefined, client.cookie)).status, 403);
  await prisma.user.createMany({ data: Array.from({ length: 25 }, (_, index) => ({ name: `Bounded ${index}`, email: `bounded-${index}-${suffix}@example.test` })) });
  const bounded = await request('/api/users?search=Bounded', undefined, admin.cookie);
  assert.equal(bounded.data.users.length, 20);
  console.log('PASS: optional CPF, required phone, normalized prefix search, 20-result limit, staff filtering, all four roles, store rules and immediate authorization changes.');
} finally { await disconnectPrisma(); }

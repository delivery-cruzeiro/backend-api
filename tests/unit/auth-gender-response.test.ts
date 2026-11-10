import Fastify from 'fastify';
import { UserGender, UserRole } from '@delivery-cruzeiro/types';
import { afterAll, beforeAll, beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ findUnique: vi.fn(), handler: vi.fn(), sendOnRegistration: vi.fn() }));
vi.mock('../../src/lib/prisma.js', () => ({ prisma: { user: { findUnique: mocks.findUnique } } }));
vi.mock('../../src/lib/auth.js', () => ({ auth: { handler: mocks.handler } }));
vi.mock('../../src/security/login-limit.js', () => ({ limitLogin: vi.fn(async () => {}) }));
vi.mock('../../src/routes/password-recovery.routes.js', () => ({ passwordRecoveryRoutes: async () => {} }));
vi.mock('../../src/services/email-confirmation.service.js', () => ({
	emailConfirmation: { sendOnRegistration: mocks.sendOnRegistration, waitForDeliveries: async () => {} },
	EmailConfirmationError: class extends Error {},
}));
import { authRoutes } from '../../src/routes/auth.routes.js';

const app = Fastify();
beforeAll(async () => { await app.register(authRoutes); await app.ready(); });
afterAll(async () => { await app.close(); });
beforeEach(() => {
	vi.clearAllMocks();
	mocks.handler.mockImplementation(async () => new Response(JSON.stringify({ user: { id: 'client' } }), { headers: { 'content-type': 'application/json' } }));
});

it.each([UserGender.FEMALE, UserGender.MALE, UserGender.NON_BINARY, UserGender.OTHER, UserGender.PREFER_NOT_TO_SAY, null])(
	'preserves saved gender %s through actual auth response serialization', async gender => {
		mocks.findUnique.mockResolvedValue({
			id: 'client', name: 'Cliente', email: 'client@example.com', gender,
			role: UserRole.CLIENT, isActive: true, emailVerified: false,
			phone: null, avatar: null, createdAt: new Date(), updatedAt: new Date(),
		});
		for (const request of [
			{ method: 'GET' as const, url: '/auth/me' },
			{ method: 'POST' as const, url: '/auth/refresh' },
			{ method: 'POST' as const, url: '/auth/login', payload: { email: 'client@example.com', password: 'password123' } },
		]) {
			const response = await app.inject(request);
			expect(response.statusCode, response.body).toBe(200);
			expect(response.json().user).toHaveProperty('gender', gender);
		}
	}
);

it('queues the confirmation email after registration succeeds', async () => {
	mocks.findUnique.mockResolvedValueOnce(null).mockResolvedValueOnce({
		id: 'client', name: 'Cliente', email: 'client@example.com', role: UserRole.CLIENT,
		isActive: true, emailVerified: false,
	});
	const response = await app.inject({
		method: 'POST', url: '/auth/register',
		payload: { email: 'client@example.com', name: 'Cliente', password: 'password123', phone: '83999999999' },
	});
	expect(response.statusCode, response.body).toBe(201);
	expect(response.json().user.emailVerified).toBe(false);
	expect(mocks.sendOnRegistration).toHaveBeenCalledExactlyOnceWith('client', expect.any(Function));
});

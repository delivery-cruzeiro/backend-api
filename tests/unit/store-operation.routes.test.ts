import { UserRole, defaultStoreOperationSettings } from '@delivery-cruzeiro/types';
import Fastify from 'fastify';
import { expect, it, vi } from 'vitest';
import { auth } from '../../src/lib/auth.js';
import { prisma } from '../../src/lib/prisma.js';
import { storeOperationRoutes } from '../../src/routes/store-operation.routes.js';

vi.mock('../../src/lib/auth.js', () => ({ auth: { api: { getSession: vi.fn() } } }));
vi.mock('../../src/lib/prisma.js', () => ({
	prisma: {
		store: { findFirst: vi.fn() },
		storeOperationSettings: { findUnique: vi.fn(), upsert: vi.fn() },
		user: { findUnique: vi.fn() },
	},
}));

it('opens a store without saved hours and lets its first settings be saved', async () => {
	const storeId = 'fe8215f0-e578-4cca-a9b4-4d8c7fd7f473';
	const manager = { id: 'manager', isActive: true, role: UserRole.MANAGER };
	const url = `/api/stores/${storeId}/operation`;
	const settings = {
		...defaultStoreOperationSettings,
		hoursEnabled: true,
		manualControl: true,
		manuallyOpen: false,
	};

	vi.mocked(prisma.store.findFirst, { partial: true }).mockResolvedValue({ id: storeId });
	vi.mocked(prisma.storeOperationSettings.findUnique).mockResolvedValue(null);
	const app = Fastify();
	app.register(storeOperationRoutes, { prefix: '/api' });

	try {
		const initial = await app.inject({ method: 'GET', url });
		expect(initial.statusCode).toBe(200);
		expect(initial.json()).toMatchObject({ isOpen: true, settings: defaultStoreOperationSettings });

		vi.mocked(auth.api.getSession, { partial: true, deep: true }).mockResolvedValue({ user: manager });
		vi.mocked(prisma.user.findUnique, { partial: true }).mockResolvedValue(manager);
		const row = { storeId, settings, updatedAt: new Date() };
		vi.mocked(prisma.storeOperationSettings.upsert).mockResolvedValue(row);
		vi.mocked(prisma.storeOperationSettings.findUnique).mockResolvedValue(row);

		const saved = await app.inject({ method: 'PUT', url, payload: settings });
		expect(saved.statusCode).toBe(200);
		expect(prisma.storeOperationSettings.upsert).toHaveBeenCalledWith({
			where: { storeId },
			create: { storeId, settings },
			update: { settings },
		});
		expect(saved.json()).toMatchObject({ isOpen: false, settings });
	} finally {
		await app.close();
	}
});

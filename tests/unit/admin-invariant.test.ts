import { UserRole } from '@delivery-cruzeiro/types';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { prisma } from '../../src/lib/prisma.js';
import {
	DEFAULT_ADMIN_EMAIL,
	DEFAULT_ADMIN_NAME,
	DEFAULT_ADMIN_PASSWORD,
	ensureDefaultAdminInvariant,
} from '../../src/services/admin-invariant.service.js';

vi.mock('better-auth/crypto', () => ({
	hashPassword: vi.fn(async (password: string) => `hashed:${password}`),
}));

vi.mock('../../src/lib/prisma', () => ({
	prisma: {
		account: {
			create: vi.fn(),
			findFirst: vi.fn(),
			updateMany: vi.fn(),
		},
		user: {
			create: vi.fn(),
			findMany: vi.fn(),
			findUnique: vi.fn(),
			update: vi.fn(),
		},
	},
}));

describe('ensureDefaultAdminInvariant', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('cria o admin padrao ativo quando nao existe administrador ativo', async () => {
		(prisma.user.findMany as any).mockResolvedValue([]);
		(prisma.user.findUnique as any).mockResolvedValue(null);
		(prisma.user.create as any).mockResolvedValue({ id: 'default-admin-id' });
		(prisma.account.findFirst as any).mockResolvedValue(null);

		await ensureDefaultAdminInvariant();

		expect(prisma.user.create).toHaveBeenCalledWith({
			data: {
				email: DEFAULT_ADMIN_EMAIL,
				emailVerified: true,
				isActive: true,
				name: DEFAULT_ADMIN_NAME,
				role: UserRole.ADMIN,
			},
			select: {
				id: true,
			},
		});
		expect(prisma.account.create).toHaveBeenCalledWith({
			data: {
				accountId: 'default-admin-id',
				providerId: 'credential',
				userId: 'default-admin-id',
				password: `hashed:${DEFAULT_ADMIN_PASSWORD}`,
			},
		});
	});

	it('reativa o admin padrao quando ele e o unico administrador disponivel', async () => {
		(prisma.user.findMany as any).mockResolvedValue([]);
		(prisma.user.findUnique as any).mockResolvedValue({
			id: 'default-admin-id',
			isActive: false,
		});
		(prisma.user.update as any).mockResolvedValue({ id: 'default-admin-id' });
		(prisma.account.findFirst as any).mockResolvedValue({ id: 'credential-id' });

		await ensureDefaultAdminInvariant();

		expect(prisma.user.update).toHaveBeenCalledWith({
			where: {
				id: 'default-admin-id',
			},
			data: {
				emailVerified: true,
				isActive: true,
				name: DEFAULT_ADMIN_NAME,
				role: UserRole.ADMIN,
			},
			select: {
				id: true,
			},
		});
		expect(prisma.account.updateMany).toHaveBeenCalledWith({
			where: {
				userId: 'default-admin-id',
				providerId: 'credential',
			},
			data: {
				accountId: 'default-admin-id',
				password: `hashed:${DEFAULT_ADMIN_PASSWORD}`,
			},
		});
	});

	it('desativa o admin padrao quando existe outro administrador ativo', async () => {
		(prisma.user.findMany as any).mockResolvedValue([{ id: 'custom-admin-id' }]);
		(prisma.user.findUnique as any).mockResolvedValue({
			id: 'default-admin-id',
			isActive: true,
		});

		await ensureDefaultAdminInvariant();

		expect(prisma.user.update).toHaveBeenCalledWith({
			where: {
				id: 'default-admin-id',
			},
			data: {
				isActive: false,
			},
		});
		expect(prisma.account.create).not.toHaveBeenCalled();
	});
});

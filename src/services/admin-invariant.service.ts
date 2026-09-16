import { UserRole } from '@delivery-cruzeiro/types';
import { hashPassword } from 'better-auth/crypto';
import { prisma } from '../lib/prisma.js';

export const DEFAULT_ADMIN_EMAIL = process.env.DEFAULT_ADMIN_EMAIL || 'admin@admin.com';
export const DEFAULT_ADMIN_NAME = 'admin';
export const DEFAULT_ADMIN_PASSWORD = process.env.DEFAULT_ADMIN_PASSWORD ||
	(process.env.NODE_ENV === 'production' ? '' : 'admin-password');

const administratorRoles = [UserRole.ADMIN, UserRole.SUPER_ADMIN];
const credentialProviderId = 'credential';

async function ensureCredentialAccount(userId: string, password: string) {
	const credentialAccount = await prisma.account.findFirst({
		where: {
			userId,
			providerId: credentialProviderId,
		},
		select: {
			id: true,
			password: true,
		},
	});
	if (credentialAccount?.password) return;
	const passwordHash = await hashPassword(password);

	if (credentialAccount) {
		await prisma.account.updateMany({
			where: {
				userId,
				providerId: credentialProviderId,
			},
			data: {
				accountId: userId,
				password: passwordHash,
			},
		});
		return;
	}

	await prisma.account.create({
		data: {
			accountId: userId,
			providerId: credentialProviderId,
			userId,
			password: passwordHash,
		},
	});
}

export async function ensureDefaultAdminInvariant() {
	if (!DEFAULT_ADMIN_PASSWORD) {
		throw new Error('DEFAULT_ADMIN_PASSWORD must be configured for production bootstrap');
	}
	const activeCustomAdministrators = await prisma.user.findMany({
		where: {
			email: {
				not: DEFAULT_ADMIN_EMAIL,
			},
			isActive: true,
			role: {
				in: administratorRoles,
			},
		},
		select: {
			id: true,
		},
	});
	const defaultAdmin = await prisma.user.findUnique({
		where: {
			email: DEFAULT_ADMIN_EMAIL,
		},
		select: {
			id: true,
			isActive: true,
		},
	});

	if (activeCustomAdministrators.length > 0) {
		if (defaultAdmin?.isActive) {
			await prisma.user.update({
				where: {
					id: defaultAdmin.id,
				},
				data: {
					isActive: false,
				},
			});
		}

		return;
	}

	const ensuredDefaultAdmin = defaultAdmin
		? await prisma.user.update({
				where: {
					id: defaultAdmin.id,
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
			})
		: await prisma.user.create({
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

	await ensureCredentialAccount(ensuredDefaultAdmin.id, DEFAULT_ADMIN_PASSWORD);
}

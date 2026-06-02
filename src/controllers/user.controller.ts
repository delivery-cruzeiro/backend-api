import type { CreateUserDTO, UpdateUserDTO } from '@delivery-cruzeiro/types';
import { hashPassword } from 'better-auth/crypto';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { prisma } from '../lib/prisma.js';
import { ensureDefaultAdminInvariant } from '../services/admin-invariant.service.js';
import {
	buildStoreConnect,
	buildStoreSet,
	ensureActiveStoresExist,
	getStoreValidationStatus,
	storeSummaryListArgs,
} from '../services/catalog-store.utils.js';

const publicUserSelect = {
	id: true,
	email: true,
	name: true,
	gender: true,
	phone: true,
	avatar: true,
	role: true,
	isActive: true,
	emailVerified: true,
	createdAt: true,
	updatedAt: true,
	stores: storeSummaryListArgs,
} as const;

function isClientRole(role?: string) {
	return (role ?? 'CLIENT') === 'CLIENT';
}

async function validateUserStores(role: string | undefined, storeIds?: string[]) {
	if (isClientRole(role)) {
		return;
	}

	await ensureActiveStoresExist(storeIds);
}

export const createUser = async (
	request: FastifyRequest<{ Body: CreateUserDTO }>,
	reply: FastifyReply
) => {
	try {
		const { email, password, name, phone, role = 'CLIENT', storeIds } = request.body;

		const existingUser = await prisma.user.findUnique({
			where: { email },
		});

		if (existingUser) {
			return reply.status(409).send({
				error: 'Email ja cadastrado',
			});
		}

		const hashedPassword = await hashPassword(password);
		try {
			await validateUserStores(role, storeIds);
		} catch (storeError) {
			const message =
				storeError instanceof Error ? storeError.message : 'Erro interno do servidor';

			return reply.status(getStoreValidationStatus(message)).send({ error: message });
		}

		const user = await prisma.user.create({
			data: {
				email,
				password: hashedPassword,
				name,
				phone,
				role,
				isActive: true,
				emailVerified: false,
				...(!isClientRole(role) && { stores: buildStoreConnect(storeIds) }),
			},
			select: publicUserSelect,
		});

		await prisma.account.create({
			data: {
				accountId: user.id,
				providerId: 'credential',
				userId: user.id,
				password: hashedPassword,
			},
		});
		await ensureDefaultAdminInvariant();

		return reply.status(201).send({
			message: 'Usuario criado com sucesso',
			user,
		});
	} catch (error) {
		console.error('Erro ao criar usuario:', error);
		return reply.status(500).send({
			error: 'Erro interno do servidor',
		});
	}
};

export const getUsers = async (_request: FastifyRequest, reply: FastifyReply) => {
	try {
		const users = await prisma.user.findMany({
			select: publicUserSelect,
			orderBy: {
				createdAt: 'desc',
			},
		});

		return reply.send({
			users,
			total: users.length,
		});
	} catch (error) {
		console.error('Erro ao buscar usuarios:', error);
		return reply.status(500).send({
			error: 'Erro interno do servidor',
		});
	}
};

export const getUserById = async (
	request: FastifyRequest<{ Params: { id: string } }>,
	reply: FastifyReply
) => {
	try {
		const { id } = request.params;

		const user = await prisma.user.findUnique({
			where: { id },
			select: {
				...publicUserSelect,
				addresses: true,
				paymentMethods: true,
				orders: {
					select: {
						id: true,
						status: true,
						total: true,
						createdAt: true,
					},
					orderBy: {
						createdAt: 'desc',
					},
					take: 10,
				},
			},
		});

		if (!user) {
			return reply.status(404).send({
				error: 'Usuario nao encontrado',
			});
		}

		return reply.send({
			user,
		});
	} catch (error) {
		console.error('Erro ao buscar usuario:', error);
		return reply.status(500).send({
			error: 'Erro interno do servidor',
		});
	}
};

export const updateUser = async (
	request: FastifyRequest<{
		Params: { id: string };
		Body: UpdateUserDTO;
	}>,
	reply: FastifyReply
) => {
	try {
		const { id } = request.params;
		const { email, name, phone, role, isActive, storeIds } = request.body;

		const existingUser = await prisma.user.findUnique({
			where: { id },
			select: {
				email: true,
				role: true,
				stores: {
					select: { id: true },
				},
			},
		});

		if (!existingUser) {
			return reply.status(404).send({
				error: 'Usuario nao encontrado',
			});
		}

		if (email && email !== existingUser.email) {
			const emailExists = await prisma.user.findUnique({
				where: { email },
			});

			if (emailExists) {
				return reply.status(409).send({
					error: 'Email ja cadastrado',
				});
			}
		}

		const nextRole = role ?? existingUser.role;

		if (!isClientRole(nextRole)) {
			if (storeIds !== undefined) {
				try {
					await ensureActiveStoresExist(storeIds);
				} catch (storeError) {
					const message =
						storeError instanceof Error
							? storeError.message
							: 'Erro interno do servidor';

					return reply.status(getStoreValidationStatus(message)).send({ error: message });
				}
			} else if (existingUser.stores.length === 0) {
				return reply.status(400).send({
					error: 'Selecione ao menos uma loja',
				});
			}
		}

		const user = await prisma.user.update({
			where: { id },
			data: {
				...(email && { email }),
				...(name && { name }),
				...(phone !== undefined && { phone }),
				...(role && { role }),
				...(isActive !== undefined && { isActive }),
				...(role && isClientRole(role) && { stores: buildStoreSet([]) }),
				...(!isClientRole(nextRole) &&
					storeIds !== undefined && { stores: buildStoreSet(storeIds) }),
			},
			select: publicUserSelect,
		});
		await ensureDefaultAdminInvariant();

		const reconciledUser = await prisma.user.findUnique({
			where: { id: user.id },
			select: publicUserSelect,
		});

		return reply.send({
			message: 'Usuario atualizado com sucesso',
			user: reconciledUser ?? user,
		});
	} catch (error) {
		console.error('Erro ao atualizar usuario:', error);
		return reply.status(500).send({
			error: 'Erro interno do servidor',
		});
	}
};

export const deleteUser = async (
	request: FastifyRequest<{ Params: { id: string } }>,
	reply: FastifyReply
) => {
	try {
		const { id } = request.params;

		const existingUser = await prisma.user.findUnique({
			where: { id },
		});

		if (!existingUser) {
			return reply.status(404).send({
				error: 'Usuario nao encontrado',
			});
		}

		await prisma.user.delete({
			where: { id },
		});
		await ensureDefaultAdminInvariant();

		return reply.send({
			message: 'Usuario deletado com sucesso',
		});
	} catch (error) {
		console.error('Erro ao deletar usuario:', error);
		return reply.status(500).send({
			error: 'Erro interno do servidor',
		});
	}
};

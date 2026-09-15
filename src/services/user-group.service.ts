import {
	UserGroupMode,
	userGroupRulesSchema,
	type UpdateUserGroupDTO,
	type UserGroupDTO,
	type UserGroupRuleDTO,
} from '@delivery-cruzeiro/types';
import { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma.js';

export class UserGroupServiceError extends Error {
	constructor(
		message: string,
		readonly statusCode: number
	) {
		super(message);
	}
}

const userGroupSelect = {
	id: true,
	name: true,
	mode: true,
	rules: true,
	createdAt: true,
	updatedAt: true,
	members: {
		select: {
			user: {
				select: {
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
				},
			},
		},
	},
} as const;

type SelectedUserGroup = Prisma.UserGroupGetPayload<{ select: typeof userGroupSelect }>;

function parseRules(rules: unknown): UserGroupRuleDTO[] {
	if (Array.isArray(rules) && rules.length === 0) {
		return [];
	}

	const validation = userGroupRulesSchema.safeParse(rules);
	if (!validation.success) {
		throw new UserGroupServiceError('Estrutura de regras invalida', 400);
	}
	return validation.data;
}

function normalizeRules(mode: UserGroupMode, rules: unknown) {
	return mode === UserGroupMode.MANUAL ? [] : parseRules(rules);
}

function serializeUserGroup(group: SelectedUserGroup) {
	return {
		...group,
		mode: group.mode as UserGroupMode,
		rules: normalizeRules(group.mode as UserGroupMode, group.rules),
		members: group.members.map(member => member.user),
	};
}

async function ensureUsersExist(userIds: string[]) {
	const uniqueUserIds = [...new Set(userIds)];
	if (uniqueUserIds.length === 0) {
		return uniqueUserIds;
	}

	const users = await prisma.user.findMany({
		where: { id: { in: uniqueUserIds } },
		select: { id: true },
	});

	if (users.length !== uniqueUserIds.length) {
		throw new UserGroupServiceError('Usuario nao encontrado', 404);
	}

	return uniqueUserIds;
}

export async function listUserGroups() {
	const groups = await prisma.userGroup.findMany({
		orderBy: { name: 'asc' },
		select: userGroupSelect,
	});

	return groups.map(serializeUserGroup);
}

export async function createUserGroup(data: UserGroupDTO) {
	const userIds = await ensureUsersExist(data.userIds);
	const rules = normalizeRules(data.mode, data.rules);
	const group = await prisma.userGroup.create({
		data: {
			mode: data.mode,
			name: data.name,
			rules: rules as Prisma.InputJsonValue,
			members:
				userIds.length > 0
					? { createMany: { data: userIds.map(userId => ({ userId })) } }
					: undefined,
		},
		select: userGroupSelect,
	});

	return serializeUserGroup(group);
}

export async function updateUserGroup(id: string, data: UpdateUserGroupDTO) {
	const existingGroup = await prisma.userGroup.findUnique({
		where: { id },
		select: { id: true, mode: true, rules: true },
	});

	if (!existingGroup) {
		throw new UserGroupServiceError('Grupo nao encontrado', 404);
	}

	const userIds = data.userIds ? await ensureUsersExist(data.userIds) : undefined;
	const nextMode = (data.mode ?? existingGroup.mode) as UserGroupMode;
	const nextRules = normalizeRules(nextMode, data.rules ?? existingGroup.rules);

	await prisma.$transaction(async transaction => {
		if (userIds) {
			await transaction.userGroupMember.deleteMany({ where: { groupId: id } });
		}

		await transaction.userGroup.update({
			where: { id },
			data: {
				...(data.name !== undefined && { name: data.name }),
				mode: nextMode,
				rules: nextRules as Prisma.InputJsonValue,
				...(userIds && userIds.length > 0
					? {
							members: {
								createMany: { data: userIds.map(userId => ({ userId })) },
							},
						}
					: {}),
			},
		});
	});

	const group = await prisma.userGroup.findUniqueOrThrow({
		where: { id },
		select: userGroupSelect,
	});

	return serializeUserGroup(group);
}

export async function deleteUserGroup(id: string) {
	const existingGroup = await prisma.userGroup.findUnique({
		where: { id },
		select: { id: true },
	});

	if (!existingGroup) {
		throw new UserGroupServiceError('Grupo nao encontrado', 404);
	}

	await prisma.userGroup.delete({ where: { id } });
}

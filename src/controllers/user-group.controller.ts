import {
	createUserGroupSchema,
	formatZodError,
	searchUserGroupUsersSchema,
	updateUserGroupSchema,
	type SearchUserGroupUsersDTO,
	type UpdateUserGroupDTO,
	type UserGroupDTO,
} from '@delivery-cruzeiro/types';
import type { FastifyReply, FastifyRequest } from 'fastify';
import {
	createUserGroup as createUserGroupRecord,
	deleteUserGroup as deleteUserGroupRecord,
	listUserGroups,
	updateUserGroup as updateUserGroupRecord,
	UserGroupServiceError,
} from '../services/user-group.service.js';
import {
	getUserGroupRuleOptions,
	searchUsersByGroupRules,
	UserGroupRuleValidationError,
} from '../services/user-group-rule.service.js';

function sendValidationError(reply: FastifyReply, error: ReturnType<typeof formatZodError>) {
	return reply.status(error.statusCode ?? 400).send({
		code: error.code,
		details: error.details,
		error: error.message,
	});
}

function sendControllerError(reply: FastifyReply, error: unknown, operation: string) {
	if (error instanceof UserGroupServiceError) {
		return reply.status(error.statusCode).send({ error: error.message });
	}
	if (error instanceof UserGroupRuleValidationError) {
		return reply.status(400).send({ error: error.message });
	}

	console.error(`Erro ao ${operation} grupo de usuarios:`, error);
	return reply.status(500).send({ error: 'Erro interno do servidor' });
}

export const getUserGroups = async (_request: FastifyRequest, reply: FastifyReply) => {
	try {
		const groups = await listUserGroups();
		return reply.send({ groups, total: groups.length });
	} catch (error) {
		return sendControllerError(reply, error, 'listar');
	}
};

export const getUserGroupRuleOptionsController = async (
	_request: FastifyRequest,
	reply: FastifyReply
) => {
	try {
		return reply.send({ options: await getUserGroupRuleOptions() });
	} catch (error) {
		return sendControllerError(reply, error, 'listar opcoes de regras de');
	}
};

export const searchUserGroupUsers = async (
	request: FastifyRequest<{ Body: SearchUserGroupUsersDTO }>,
	reply: FastifyReply
) => {
	try {
		const validation = searchUserGroupUsersSchema.safeParse(request.body ?? {});
		if (!validation.success) {
			return sendValidationError(reply, formatZodError(validation.error));
		}

		const users = await searchUsersByGroupRules(validation.data.rules);
		return reply.send({ users, total: users.length });
	} catch (error) {
		return sendControllerError(reply, error, 'pesquisar usuarios para');
	}
};

export const createUserGroup = async (
	request: FastifyRequest<{ Body: UserGroupDTO }>,
	reply: FastifyReply
) => {
	try {
		const validation = createUserGroupSchema.safeParse(request.body ?? {});
		if (!validation.success) {
			return sendValidationError(reply, formatZodError(validation.error));
		}

		const group = await createUserGroupRecord(validation.data);
		return reply.status(201).send({ group, message: 'Grupo criado com sucesso' });
	} catch (error) {
		return sendControllerError(reply, error, 'criar');
	}
};

export const updateUserGroup = async (
	request: FastifyRequest<{ Body: UpdateUserGroupDTO; Params: { id: string } }>,
	reply: FastifyReply
) => {
	try {
		const validation = updateUserGroupSchema.safeParse(request.body ?? {});
		if (!validation.success) {
			return sendValidationError(reply, formatZodError(validation.error));
		}

		const group = await updateUserGroupRecord(request.params.id, validation.data);
		return reply.send({ group, message: 'Grupo atualizado com sucesso' });
	} catch (error) {
		return sendControllerError(reply, error, 'atualizar');
	}
};

export const deleteUserGroup = async (
	request: FastifyRequest<{ Params: { id: string } }>,
	reply: FastifyReply
) => {
	try {
		await deleteUserGroupRecord(request.params.id);
		return reply.send({ message: 'Grupo deletado com sucesso' });
	} catch (error) {
		return sendControllerError(reply, error, 'deletar');
	}
};

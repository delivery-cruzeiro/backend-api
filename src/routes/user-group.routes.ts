import type { FastifyInstance, RouteHandlerMethod } from 'fastify';
import {
	createUserGroup,
	deleteUserGroup,
	getUserGroupRuleOptionsController,
	getUserGroups,
	searchUserGroupUsers,
	updateUserGroup,
} from '../controllers/user-group.controller.js';
import { requireAdmin } from '../middleware/auth.middleware.js';

const createUserGroupHandler = createUserGroup as unknown as RouteHandlerMethod;
const deleteUserGroupHandler = deleteUserGroup as unknown as RouteHandlerMethod;
const searchUserGroupUsersHandler = searchUserGroupUsers as unknown as RouteHandlerMethod;
const updateUserGroupHandler = updateUserGroup as unknown as RouteHandlerMethod;

export async function userGroupRoutes(fastify: FastifyInstance) {
	fastify.get('/admin/user-groups', { preHandler: requireAdmin }, getUserGroups);
	fastify.get(
		'/admin/user-groups/rule-options',
		{ preHandler: requireAdmin },
		getUserGroupRuleOptionsController
	);
	fastify.post(
		'/admin/user-groups/search-users',
		{ preHandler: requireAdmin },
		searchUserGroupUsersHandler
	);
	fastify.post('/admin/user-groups', { preHandler: requireAdmin }, createUserGroupHandler);
	fastify.put('/admin/user-groups/:id', { preHandler: requireAdmin }, updateUserGroupHandler);
	fastify.delete('/admin/user-groups/:id', { preHandler: requireAdmin }, deleteUserGroupHandler);
}

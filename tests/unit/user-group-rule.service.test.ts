import {
	UserGroupLogicalOperator,
	UserGroupRuleOperator,
	UserGroupRulePreset,
	UserGroupRuleSource,
	UserRole,
	type UserGroupRuleDTO,
} from '@delivery-cruzeiro/types';
import { describe, expect, it, vi } from 'vitest';
import { prisma } from '../../src/lib/prisma.js';
import {
	buildUserGroupRuleWhere,
	UserGroupRuleValidationError,
} from '../../src/services/user-group-rule.service.js';

vi.mock('../../src/lib/prisma.js', () => ({
	prisma: { order: { groupBy: vi.fn() } },
}));

describe('user group rule service', () => {
	it('groups order and item AND rules under the same order relationship', async () => {
		const rules: UserGroupRuleDTO[] = [
			{
				field: 'gender',
				operator: UserGroupRuleOperator.EQUAL,
				source: UserGroupRuleSource.USER,
				value: 'MALE',
			},
			{
				field: 'status',
				logicalOperator: UserGroupLogicalOperator.AND,
				operator: UserGroupRuleOperator.EQUAL,
				source: UserGroupRuleSource.ORDER,
				value: 'DELIVERED',
			},
			{
				field: 'total',
				logicalOperator: UserGroupLogicalOperator.AND,
				operator: UserGroupRuleOperator.GREATER_THAN_OR_EQUAL,
				source: UserGroupRuleSource.ORDER,
				value: 100,
			},
			{
				field: 'quantity',
				logicalOperator: UserGroupLogicalOperator.AND,
				operator: UserGroupRuleOperator.GREATER_THAN,
				source: UserGroupRuleSource.ITEM,
				value: 1,
			},
		];

		await expect(buildUserGroupRuleWhere(rules)).resolves.toEqual({
			AND: [
				{ gender: { equals: 'MALE' } },
				{
					orders: {
						some: {
							AND: [
								{ status: { equals: 'DELIVERED' } },
								{ total: { gte: 100 } },
								{ items: { some: { AND: [{ quantity: { gt: 1 } }] } } },
							],
						},
					},
				},
			],
		});
	});

	it('uses explicit OR groups with AND precedence', async () => {
		const rules: UserGroupRuleDTO[] = [
			{
				field: 'name',
				operator: UserGroupRuleOperator.EQUAL,
				source: UserGroupRuleSource.USER,
				value: 'Ana',
			},
			{
				field: 'total',
				logicalOperator: UserGroupLogicalOperator.AND,
				operator: UserGroupRuleOperator.GREATER_THAN,
				source: UserGroupRuleSource.ORDER,
				value: 50,
			},
			{
				field: 'email',
				logicalOperator: UserGroupLogicalOperator.OR,
				operator: UserGroupRuleOperator.EQUAL,
				source: UserGroupRuleSource.USER,
				value: 'cliente@example.com',
			},
		];

		const where = await buildUserGroupRuleWhere(rules);
		expect(where).toHaveProperty('OR');
		expect(where).not.toHaveProperty('items');
	});

	it('rejects operators that are not allowed for a field', async () => {
		const rules: UserGroupRuleDTO[] = [
			{
				field: 'name',
				operator: UserGroupRuleOperator.GREATER_THAN,
				source: UserGroupRuleSource.USER,
				value: 'Ana',
			},
		];

		await expect(buildUserGroupRuleWhere(rules)).rejects.toThrow(UserGroupRuleValidationError);
	});

	it('matches clients with no orders or exactly ten registered orders', async () => {
		const groupOrders = vi.mocked(prisma.order.groupBy);
		groupOrders.mockResolvedValueOnce([{ userId: 'customer-with-ten-orders' }]);
		const where = await buildUserGroupRuleWhere([
			{
				field: 'preset',
				operator: UserGroupRuleOperator.EQUAL,
				source: UserGroupRuleSource.PRESET,
				value: UserGroupRulePreset.FIRST_ORDER,
			},
			{
				field: 'preset',
				logicalOperator: UserGroupLogicalOperator.OR,
				operator: UserGroupRuleOperator.EQUAL,
				source: UserGroupRuleSource.PRESET,
				value: UserGroupRulePreset.REGULAR_CUSTOMER_10_ORDERS,
			},
		]);
		expect(groupOrders).toHaveBeenCalledExactlyOnceWith({
			by: ['userId'],
			where: { user: { role: UserRole.CLIENT } },
			having: { userId: { _count: { equals: 10 } } },
		});
		expect(where).toEqual({
			OR: [
				{ AND: [{ role: UserRole.CLIENT, orders: { none: {} } }] },
				{ AND: [{ role: UserRole.CLIENT, id: { in: ['customer-with-ten-orders'] } }] },
			],
		});
	});
});

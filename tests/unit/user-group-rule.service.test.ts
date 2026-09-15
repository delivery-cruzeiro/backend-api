import {
	UserGroupLogicalOperator,
	UserGroupRuleOperator,
	UserGroupRuleSource,
	type UserGroupRuleDTO,
} from '@delivery-cruzeiro/types';
import { describe, expect, it } from 'vitest';
import {
	buildUserGroupRuleWhere,
	UserGroupRuleValidationError,
} from '../../src/services/user-group-rule.service.js';

describe('user group rule service', () => {
	it('groups order and item AND rules under the same order relationship', () => {
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

		expect(buildUserGroupRuleWhere(rules)).toEqual({
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

	it('uses explicit OR groups with AND precedence', () => {
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

		const where = buildUserGroupRuleWhere(rules);
		expect(where).toHaveProperty('OR');
		expect(where).not.toHaveProperty('items');
	});

	it('rejects operators that are not allowed for a field', () => {
		const rules: UserGroupRuleDTO[] = [
			{
				field: 'name',
				operator: UserGroupRuleOperator.GREATER_THAN,
				source: UserGroupRuleSource.USER,
				value: 'Ana',
			},
		];

		expect(() => buildUserGroupRuleWhere(rules)).toThrow(UserGroupRuleValidationError);
	});
});

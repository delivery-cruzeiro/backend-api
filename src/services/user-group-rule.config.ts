import {
	OrderStatus,
	UserGender,
	UserGroupRuleOperator,
	UserGroupRuleSource,
	UserRole,
	type UserGroupItemRuleField,
	type UserGroupOrderRuleField,
	type UserGroupUserRuleField,
} from '@delivery-cruzeiro/types';

export type UserGroupRuleValueType = 'boolean' | 'date' | 'entity' | 'enum' | 'number' | 'text';

export type UserGroupRuleFieldConfig = {
	allowedValues?: readonly string[];
	integer?: boolean;
	operators: readonly UserGroupRuleOperator[];
	valueType: UserGroupRuleValueType;
};

const equalityOperators = [UserGroupRuleOperator.EQUAL] as const;
const rangeOperators = [
	UserGroupRuleOperator.LESS_THAN,
	UserGroupRuleOperator.LESS_THAN_OR_EQUAL,
	UserGroupRuleOperator.EQUAL,
	UserGroupRuleOperator.GREATER_THAN_OR_EQUAL,
	UserGroupRuleOperator.GREATER_THAN,
] as const;

const userFields: Record<UserGroupUserRuleField, UserGroupRuleFieldConfig> = {
	name: { operators: equalityOperators, valueType: 'text' },
	email: { operators: equalityOperators, valueType: 'text' },
	phone: { operators: equalityOperators, valueType: 'text' },
	avatar: { operators: equalityOperators, valueType: 'text' },
	role: {
		allowedValues: Object.values(UserRole),
		operators: equalityOperators,
		valueType: 'enum',
	},
	isActive: { operators: equalityOperators, valueType: 'boolean' },
	createdAt: { operators: rangeOperators, valueType: 'date' },
	updatedAt: { operators: rangeOperators, valueType: 'date' },
	emailVerified: { operators: equalityOperators, valueType: 'boolean' },
	gender: {
		allowedValues: Object.values(UserGender),
		operators: equalityOperators,
		valueType: 'enum',
	},
};

const orderFields: Record<UserGroupOrderRuleField, UserGroupRuleFieldConfig> = {
	paymentMethodId: { operators: equalityOperators, valueType: 'entity' },
	addressId: { operators: equalityOperators, valueType: 'text' },
	status: {
		allowedValues: Object.values(OrderStatus),
		operators: equalityOperators,
		valueType: 'enum',
	},
	subtotal: { operators: rangeOperators, valueType: 'number' },
	deliveryFee: { operators: rangeOperators, valueType: 'number' },
	discount: { operators: rangeOperators, valueType: 'number' },
	total: { operators: rangeOperators, valueType: 'number' },
	estimatedDelivery: { operators: rangeOperators, valueType: 'date' },
	deliveredAt: { operators: rangeOperators, valueType: 'date' },
	createdAt: { operators: rangeOperators, valueType: 'date' },
	updatedAt: { operators: rangeOperators, valueType: 'date' },
	orderNumber: { integer: true, operators: rangeOperators, valueType: 'number' },
	store_id: { operators: equalityOperators, valueType: 'entity' },
	promotion_id: { operators: equalityOperators, valueType: 'entity' },
};

const itemFields: Record<UserGroupItemRuleField, UserGroupRuleFieldConfig> = {
	orderId: { operators: equalityOperators, valueType: 'entity' },
	productId: { operators: equalityOperators, valueType: 'entity' },
	quantity: { integer: true, operators: rangeOperators, valueType: 'number' },
	price: { operators: rangeOperators, valueType: 'number' },
};

export const USER_GROUP_RULE_ALLOWLIST = {
	[UserGroupRuleSource.USER]: userFields,
	[UserGroupRuleSource.ORDER]: orderFields,
	[UserGroupRuleSource.ITEM]: itemFields,
} as const;

export function getUserGroupRuleFieldConfig(
	source: UserGroupRuleSource,
	field: string
): UserGroupRuleFieldConfig | undefined {
	return (USER_GROUP_RULE_ALLOWLIST[source] as Record<string, UserGroupRuleFieldConfig>)[field];
}

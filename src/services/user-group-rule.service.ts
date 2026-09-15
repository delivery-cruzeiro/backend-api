import {
	UserGroupLogicalOperator,
	UserGroupRuleOperator,
	UserGroupRuleSource,
	userGroupRulesSchema,
	type UserGroupRuleDTO,
} from '@delivery-cruzeiro/types';
import type { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma.js';
import {
	getUserGroupRuleFieldConfig,
	type UserGroupRuleFieldConfig,
} from './user-group-rule.config.js';

export class UserGroupRuleValidationError extends Error {}

type RuleOption = {
	label: string;
	value: string;
};

function parseRuleValue(rule: UserGroupRuleDTO, config: UserGroupRuleFieldConfig) {
	const { value } = rule;

	switch (config.valueType) {
		case 'boolean':
			if (typeof value !== 'boolean') {
				throw new UserGroupRuleValidationError('O valor da regra deve ser booleano');
			}
			return value;
		case 'number': {
			if (typeof value !== 'number' || !Number.isFinite(value)) {
				throw new UserGroupRuleValidationError('O valor da regra deve ser numerico');
			}
			if (config.integer && !Number.isInteger(value)) {
				throw new UserGroupRuleValidationError('O valor da regra deve ser inteiro');
			}
			return value;
		}
		case 'date': {
			if (typeof value !== 'string') {
				throw new UserGroupRuleValidationError('O valor da regra deve ser uma data');
			}
			const date = new Date(value);
			if (Number.isNaN(date.getTime())) {
				throw new UserGroupRuleValidationError('A data informada e invalida');
			}
			return date;
		}
		case 'enum':
			if (typeof value !== 'string' || !config.allowedValues?.includes(value)) {
				throw new UserGroupRuleValidationError(
					'O valor informado nao pertence ao enum permitido'
				);
			}
			return value;
		case 'entity':
		case 'text':
			if (typeof value !== 'string' || value.trim().length === 0) {
				throw new UserGroupRuleValidationError(
					'O valor da regra deve ser um texto nao vazio'
				);
			}
			return value.trim();
	}
}

function buildComparison(rule: UserGroupRuleDTO, config: UserGroupRuleFieldConfig) {
	if (!config.operators.includes(rule.operator)) {
		throw new UserGroupRuleValidationError(
			`O operador ${rule.operator} nao e permitido para o campo ${rule.field}`
		);
	}

	const value = parseRuleValue(rule, config);
	const comparisonKey = {
		[UserGroupRuleOperator.LESS_THAN]: 'lt',
		[UserGroupRuleOperator.LESS_THAN_OR_EQUAL]: 'lte',
		[UserGroupRuleOperator.EQUAL]: 'equals',
		[UserGroupRuleOperator.GREATER_THAN_OR_EQUAL]: 'gte',
		[UserGroupRuleOperator.GREATER_THAN]: 'gt',
	}[rule.operator];

	if (config.valueType === 'text') {
		return { [comparisonKey]: value, mode: 'insensitive' as const };
	}

	return { [comparisonKey]: value };
}

function getRuleConfig(rule: UserGroupRuleDTO) {
	const config = getUserGroupRuleFieldConfig(rule.source, rule.field);
	if (!config) {
		throw new UserGroupRuleValidationError('Campo de regra nao permitido');
	}
	return config;
}

function buildUserPredicate(rule: UserGroupRuleDTO): Prisma.UserWhereInput {
	const comparison = buildComparison(rule, getRuleConfig(rule)) as never;

	switch (rule.field) {
		case 'name':
			return { name: comparison };
		case 'email':
			return { email: comparison };
		case 'phone':
			return { phone: comparison };
		case 'avatar':
			return { avatar: comparison };
		case 'role':
			return { role: comparison };
		case 'isActive':
			return { isActive: comparison };
		case 'createdAt':
			return { createdAt: comparison };
		case 'updatedAt':
			return { updatedAt: comparison };
		case 'emailVerified':
			return { emailVerified: comparison };
		case 'gender':
			return { gender: comparison };
		default:
			throw new UserGroupRuleValidationError('Campo de usuario nao permitido');
	}
}

function buildOrderPredicate(rule: UserGroupRuleDTO): Prisma.OrderWhereInput {
	const comparison = buildComparison(rule, getRuleConfig(rule)) as never;

	switch (rule.field) {
		case 'paymentMethodId':
			return { paymentMethodId: comparison };
		case 'addressId':
			return { address: { is: { neighborhood: comparison } } };
		case 'status':
			return { status: comparison };
		case 'subtotal':
			return { subtotal: comparison };
		case 'deliveryFee':
			return { deliveryFee: comparison };
		case 'discount':
			return { discount: comparison };
		case 'total':
			return { total: comparison };
		case 'estimatedDelivery':
			return { estimatedDelivery: comparison };
		case 'deliveredAt':
			return { deliveredAt: comparison };
		case 'createdAt':
			return { createdAt: comparison };
		case 'updatedAt':
			return { updatedAt: comparison };
		case 'orderNumber':
			return { orderNumber: comparison };
		case 'store_id':
			return { storeId: comparison };
		case 'promotion_id':
			return { promotionId: comparison };
		default:
			throw new UserGroupRuleValidationError('Campo de pedido nao permitido');
	}
}

function buildItemPredicate(rule: UserGroupRuleDTO): Prisma.OrderItemWhereInput {
	const comparison = buildComparison(rule, getRuleConfig(rule)) as never;

	switch (rule.field) {
		case 'orderId':
			return { orderId: comparison };
		case 'productId':
			return { productId: comparison };
		case 'quantity':
			return { quantity: comparison };
		case 'price':
			return { price: comparison };
		default:
			throw new UserGroupRuleValidationError('Campo de item nao permitido');
	}
}

function buildAndGroup(rules: UserGroupRuleDTO[]): Prisma.UserWhereInput {
	const userPredicates = rules
		.filter(rule => rule.source === UserGroupRuleSource.USER)
		.map(buildUserPredicate);
	const orderPredicates = rules
		.filter(rule => rule.source === UserGroupRuleSource.ORDER)
		.map(buildOrderPredicate);
	const itemPredicates = rules
		.filter(rule => rule.source === UserGroupRuleSource.ITEM)
		.map(buildItemPredicate);

	if (itemPredicates.length > 0) {
		orderPredicates.push({
			items: {
				some: { AND: itemPredicates },
			},
		});
	}

	if (orderPredicates.length > 0) {
		userPredicates.push({
			orders: {
				some: { AND: orderPredicates },
			},
		});
	}

	return { AND: userPredicates };
}

export function buildUserGroupRuleWhere(rules: UserGroupRuleDTO[]): Prisma.UserWhereInput {
	const validation = userGroupRulesSchema.safeParse(rules);
	if (!validation.success) {
		throw new UserGroupRuleValidationError('Estrutura de regras invalida');
	}

	const groups: UserGroupRuleDTO[][] = [[]];
	validation.data.forEach((rule, index) => {
		if (index > 0 && rule.logicalOperator === UserGroupLogicalOperator.OR) {
			groups.push([]);
		}
		groups.at(-1)?.push(rule);
	});

	const alternatives = groups.map(buildAndGroup);
	return alternatives.length === 1 ? alternatives[0] : { OR: alternatives };
}

const matchedUserSelect = {
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
} as const;

export async function searchUsersByGroupRules(rules: UserGroupRuleDTO[]) {
	const users = await prisma.user.findMany({
		where: buildUserGroupRuleWhere(rules),
		select: matchedUserSelect,
		orderBy: { name: 'asc' },
	});

	return [...new Map(users.map(user => [user.id, user])).values()];
}

function uniqueOptions(options: RuleOption[]) {
	return [...new Map(options.map(option => [option.value, option])).values()];
}

export async function getUserGroupRuleOptions() {
	const [paymentMethods, addresses, stores, promotions, products, orders] = await Promise.all([
		prisma.paymentMethod.findMany({
			where: { isActive: true },
			select: { id: true, last4: true, provider: true, type: true },
			orderBy: { createdAt: 'desc' },
		}),
		prisma.address.findMany({
			select: { neighborhood: true },
			orderBy: { neighborhood: 'asc' },
		}),
		prisma.store.findMany({
			where: { isActive: true },
			select: { id: true, name: true, nickname: true },
			orderBy: { name: 'asc' },
		}),
		prisma.promotion.findMany({
			select: { id: true, name: true },
			orderBy: { name: 'asc' },
		}),
		prisma.product.findMany({
			select: { id: true, name: true },
			orderBy: { name: 'asc' },
		}),
		prisma.order.findMany({
			select: { id: true, orderNumber: true },
			orderBy: { orderNumber: 'desc' },
			take: 500,
		}),
	]);

	return {
		addressId: uniqueOptions(
			addresses.map(address => ({
				label: address.neighborhood,
				value: address.neighborhood,
			}))
		),
		orderId: orders.map(order => ({ label: `Pedido #${order.orderNumber}`, value: order.id })),
		paymentMethodId: paymentMethods.map(method => ({
			label: `${method.type} - ${method.last4 ? `final ${method.last4}` : method.provider}`,
			value: method.id,
		})),
		productId: products.map(product => ({ label: product.name, value: product.id })),
		promotion_id: promotions.map(promotion => ({ label: promotion.name, value: promotion.id })),
		store_id: stores.map(store => ({
			label: store.nickname || store.name,
			value: store.id,
		})),
	};
}

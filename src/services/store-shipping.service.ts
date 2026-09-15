import {
	ShippingChargeMode,
	type UpdateDefaultShippingDTO,
	type UpsertNeighborhoodShippingDTO,
} from '@delivery-cruzeiro/types';
import { prisma } from '../lib/prisma.js';

type ShippingSummaryQuery = {
	city?: string | null;
	state?: string | null;
	storeId: string;
};

type ShippingQuoteInput = {
	neighborhood?: string | null;
	storeId: string;
};

type ShippingQuote = {
	isAvailable: boolean;
	mode: ShippingChargeMode;
	neighborhood: string | null;
	ruleId?: string;
	shippingId?: string;
	shippingName?: string;
	shippingTime: number;
	source: 'blocked' | 'default' | 'manual' | 'template';
	value: number;
};

type NeighborhoodMetricRow = {
	neighborhood: string | null;
	total: bigint | number | string;
};

function normalizeNeighborhoodKey(neighborhood: string) {
	return neighborhood
		.normalize('NFD')
		.replace(/[\u0300-\u036f]/g, '')
		.trim()
		.toUpperCase();
}

function toNumber(value: unknown): number {
	return Number(value ?? 0);
}

function serializeShipping(shipping: {
	createdAt: Date;
	id: string;
	isActive: boolean;
	name: string;
	shippingTime: number;
	storeId: string;
	value: unknown;
}) {
	return {
		createdAt: shipping.createdAt.toISOString(),
		id: shipping.id,
		isActive: shipping.isActive,
		name: shipping.name,
		shippingTime: shipping.shippingTime,
		storeId: shipping.storeId,
		value: toNumber(shipping.value),
	};
}

function serializeNeighborhoodRule(rule: {
	createdAt: Date;
	id: string;
	isBlocked: boolean;
	mode: string;
	neighborhood: string;
	shipping?: Parameters<typeof serializeShipping>[0] | null;
	shippingId: string | null;
	shippingTime: number | null;
	storeId: string;
	updatedAt: Date;
	value: unknown | null;
}) {
	return {
		createdAt: rule.createdAt.toISOString(),
		id: rule.id,
		isBlocked: rule.isBlocked,
		mode: rule.mode as ShippingChargeMode,
		neighborhood: rule.neighborhood,
		shipping: rule.shipping ? serializeShipping(rule.shipping) : null,
		shippingId: rule.shippingId,
		shippingTime: rule.shippingTime,
		storeId: rule.storeId,
		updatedAt: rule.updatedAt.toISOString(),
		value: rule.value === null ? null : toNumber(rule.value),
	};
}

export class StoreShippingService {
	private async ensureDefaultShipping(storeId: string) {
		return prisma.storeShipping.upsert({
			create: {
				name: 'default',
				shippingTime: 0,
				storeId,
				value: 0,
			},
			update: {},
			where: {
				storeId_name: {
					name: 'default',
					storeId,
				},
			},
		});
	}

	private async getStoreLocation(storeId: string) {
		return prisma.store.findUnique({
			select: {
				address: {
					select: {
						city: true,
						state: true,
					},
				},
				id: true,
			},
			where: { id: storeId },
		});
	}

	private mergeMetrics(
		customerRows: NeighborhoodMetricRow[],
		salesRows: NeighborhoodMetricRow[],
		rules: Array<ReturnType<typeof serializeNeighborhoodRule>>
	) {
		const neighborhoods = new Map<
			string,
			{
				customers: number;
				neighborhood: string;
				rule: ReturnType<typeof serializeNeighborhoodRule> | null;
				sales: number;
			}
		>();

		const ensureMetric = (neighborhood: string) => {
			const key = normalizeNeighborhoodKey(neighborhood);
			const current = neighborhoods.get(key);

			if (current) {
				return current;
			}

			const metric = {
				customers: 0,
				neighborhood,
				rule: null,
				sales: 0,
			};

			neighborhoods.set(key, metric);

			return metric;
		};

		customerRows.forEach(row => {
			if (!row.neighborhood?.trim()) {
				return;
			}

			ensureMetric(row.neighborhood).customers = toNumber(row.total);
		});

		salesRows.forEach(row => {
			if (!row.neighborhood?.trim()) {
				return;
			}

			ensureMetric(row.neighborhood).sales = toNumber(row.total);
		});

		rules.forEach(rule => {
			ensureMetric(rule.neighborhood).rule = rule;
		});

		return Array.from(neighborhoods.values()).sort((first, second) =>
			first.neighborhood.localeCompare(second.neighborhood, 'pt-BR')
		);
	}

	async getSummary(query: ShippingSummaryQuery) {
		const store = await this.getStoreLocation(query.storeId);

		if (!store) {
			return null;
		}

		const city = query.city?.trim() || store.address.city;
		const state = query.state?.trim() || store.address.state;
		const defaultShipping = await this.ensureDefaultShipping(query.storeId);
		const [templates, neighborhoodRules, customerRows, salesRows] = await Promise.all([
			prisma.storeShipping.findMany({
				orderBy: [{ name: 'asc' }],
				where: {
					isActive: true,
					storeId: query.storeId,
				},
			}),
			prisma.storeNeighborhoodShipping.findMany({
				include: {
					shipping: true,
				},
				where: {
					storeId: query.storeId,
				},
			}),
			prisma.$queryRaw<NeighborhoodMetricRow[]>`
				SELECT
					NULLIF(TRIM("neighborhood"), '') AS "neighborhood",
					COUNT(DISTINCT "userId")::INT AS "total"
				FROM "Address"
				WHERE LOWER(TRIM("city")) = LOWER(TRIM(${city}))
					AND UPPER(TRIM("state")) = UPPER(TRIM(${state}))
				GROUP BY NULLIF(TRIM("neighborhood"), '')
			`,
			prisma.$queryRaw<NeighborhoodMetricRow[]>`
				SELECT
					NULLIF(TRIM(address."neighborhood"), '') AS "neighborhood",
					COUNT(orders."id")::INT AS "total"
				FROM "Order" orders
				INNER JOIN "Address" address ON address."id" = orders."addressId"
				WHERE orders."store_id" = ${query.storeId}::uuid
					AND orders."status" <> 'CANCELLED'::"OrderStatus"
					AND LOWER(TRIM(address."city")) = LOWER(TRIM(${city}))
					AND UPPER(TRIM(address."state")) = UPPER(TRIM(${state}))
				GROUP BY NULLIF(TRIM(address."neighborhood"), '')
			`,
		]);
		const rules = neighborhoodRules.map(rule => serializeNeighborhoodRule(rule));
		const neighborhoods = this.mergeMetrics(customerRows, salesRows, rules);

		return {
			defaultShipping: serializeShipping(defaultShipping),
			neighborhoods,
			templates: templates.map(template => serializeShipping(template)),
			totalNeighborhoods: neighborhoods.length,
		};
	}

	async updateDefaultShipping(input: UpdateDefaultShippingDTO) {
		const store = await this.getStoreLocation(input.storeId);

		if (!store) {
			return null;
		}

		const defaultShipping = await prisma.storeShipping.upsert({
			create: {
				name: 'default',
				shippingTime: input.shippingTime,
				storeId: input.storeId,
				value: input.value,
			},
			update: {
				isActive: true,
				shippingTime: input.shippingTime,
				value: input.value,
			},
			where: {
				storeId_name: {
					name: 'default',
					storeId: input.storeId,
				},
			},
		});

		return serializeShipping(defaultShipping);
	}

	async resolveShippingQuote(input: ShippingQuoteInput): Promise<ShippingQuote> {
		const defaultShipping = await this.ensureDefaultShipping(input.storeId);
		const defaultQuote: ShippingQuote = {
			isAvailable: true,
			mode: ShippingChargeMode.DEFAULT,
			neighborhood: input.neighborhood?.trim() || null,
			shippingTime: defaultShipping.shippingTime,
			source: 'default',
			value: toNumber(defaultShipping.value),
		};

		if (!input.neighborhood?.trim()) {
			return defaultQuote;
		}

		const rules = await prisma.storeNeighborhoodShipping.findMany({
			include: {
				shipping: true,
			},
			where: {
				storeId: input.storeId,
			},
		});
		const normalizedNeighborhood = normalizeNeighborhoodKey(input.neighborhood);
		const rule = rules.find(
			currentRule =>
				normalizeNeighborhoodKey(currentRule.neighborhood) === normalizedNeighborhood
		);

		if (!rule) {
			return defaultQuote;
		}

		if (rule.isBlocked) {
			return {
				isAvailable: false,
				mode: rule.mode as ShippingChargeMode,
				neighborhood: rule.neighborhood,
				ruleId: rule.id,
				shippingTime: 0,
				source: 'blocked',
				value: 0,
			};
		}

		if (rule.mode === ShippingChargeMode.MANUAL) {
			return {
				isAvailable: true,
				mode: ShippingChargeMode.MANUAL,
				neighborhood: rule.neighborhood,
				ruleId: rule.id,
				shippingTime: rule.shippingTime ?? defaultShipping.shippingTime,
				source: 'manual',
				value: rule.value === null ? toNumber(defaultShipping.value) : toNumber(rule.value),
			};
		}

		if (rule.mode === ShippingChargeMode.TEMPLATE && rule.shipping?.isActive) {
			return {
				isAvailable: true,
				mode: ShippingChargeMode.TEMPLATE,
				neighborhood: rule.neighborhood,
				ruleId: rule.id,
				shippingId: rule.shipping.id,
				shippingName: rule.shipping.name,
				shippingTime: rule.shipping.shippingTime,
				source: 'template',
				value: toNumber(rule.shipping.value),
			};
		}

		return {
			...defaultQuote,
			neighborhood: rule.neighborhood,
			ruleId: rule.id,
		};
	}

	async upsertNeighborhoodShipping(input: UpsertNeighborhoodShippingDTO) {
		const store = await this.getStoreLocation(input.storeId);

		if (!store) {
			return null;
		}

		const defaultShipping = await this.ensureDefaultShipping(input.storeId);
		let shippingId: string | null = null;
		let value: number | null = null;
		let shippingTime: number | null = null;

		if (input.mode === ShippingChargeMode.DEFAULT) {
			shippingId = defaultShipping.id;
		}

		if (input.mode === ShippingChargeMode.TEMPLATE) {
			const template = await prisma.storeShipping.findFirst({
				where: {
					id: input.shippingId ?? '',
					isActive: true,
					storeId: input.storeId,
				},
			});

			if (!template) {
				throw new Error('Template de frete nao encontrado para esta loja');
			}

			shippingId = template.id;
		}

		if (input.mode === ShippingChargeMode.MANUAL) {
			value = input.value ?? 0;
			shippingTime = input.shippingTime ?? 0;

			if (input.createTemplate) {
				const templateName = input.templateName?.trim() || input.neighborhood.trim();
				const template = await prisma.storeShipping.upsert({
					create: {
						name: templateName,
						shippingTime,
						storeId: input.storeId,
						value,
					},
					update: {
						isActive: true,
						shippingTime,
						value,
					},
					where: {
						storeId_name: {
							name: templateName,
							storeId: input.storeId,
						},
					},
				});

				shippingId = template.id;
			}
		}

		const rule = await prisma.storeNeighborhoodShipping.upsert({
			create: {
				isBlocked: input.isBlocked,
				mode: input.mode,
				neighborhood: input.neighborhood.trim(),
				shippingId,
				shippingTime,
				storeId: input.storeId,
				value,
			},
			include: {
				shipping: true,
			},
			update: {
				isBlocked: input.isBlocked,
				mode: input.mode,
				shippingId,
				shippingTime,
				value,
			},
			where: {
				storeId_neighborhood: {
					neighborhood: input.neighborhood.trim(),
					storeId: input.storeId,
				},
			},
		});
		const templates = await prisma.storeShipping.findMany({
			orderBy: [{ name: 'asc' }],
			where: {
				isActive: true,
				storeId: input.storeId,
			},
		});

		return {
			rule: serializeNeighborhoodRule(rule),
			templates: templates.map(template => serializeShipping(template)),
		};
	}
}

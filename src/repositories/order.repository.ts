import { OrderStatus } from '@delivery-cruzeiro/types';
import type { Prisma, PrismaClient } from '@prisma/client';
import { prisma } from '../lib/prisma.js';
import { storeSummarySelect } from '../services/catalog-store.utils.js';

export const adminOrderSelect = {
	id: true,
	userId: true,
	user: {
		select: {
			id: true,
			email: true,
			name: true,
			phone: true,
		},
	},
	addressId: true,
	address: {
		select: {
			id: true,
			userId: true,
			street: true,
			number: true,
			complement: true,
			neighborhood: true,
			city: true,
			state: true,
			zipCode: true,
			latitude: true,
			longitude: true,
			isDefault: true,
			createdAt: true,
			updatedAt: true,
		},
	},
	storeId: true,
	store: {
		select: storeSummarySelect,
	},
	paymentMethodId: true,
	status: true,
	subtotal: true,
	deliveryFee: true,
	discount: true,
	total: true,
	notes: true,
	estimatedDelivery: true,
	deliveredAt: true,
	createdAt: true,
	updatedAt: true,
	items: {
		select: {
			id: true,
			orderId: true,
			productId: true,
			product: {
				select: {
					id: true,
					name: true,
					description: true,
					imageUrl: true,
				},
			},
			quantity: true,
			price: true,
			notes: true,
		},
	},
	paymentMethod: {
		select: {
			id: true,
			type: true,
			cardType: true,
			provider: true,
			last4: true,
			cardHolder: true,
		},
	},
} satisfies Prisma.OrderSelect;

export const clientOrderSelect = {
	id: true,
	userId: true,
	addressId: true,
	address: {
		select: {
			id: true,
			userId: true,
			street: true,
			number: true,
			complement: true,
			neighborhood: true,
			city: true,
			state: true,
			zipCode: true,
			latitude: true,
			longitude: true,
			isDefault: true,
			createdAt: true,
			updatedAt: true,
		},
	},
	storeId: true,
	store: {
		select: storeSummarySelect,
	},
	paymentMethodId: true,
	paymentMethod: {
		select: {
			id: true,
			userId: true,
			type: true,
			cardType: true,
			provider: true,
			providerId: true,
			last4: true,
			expiryMonth: true,
			expiryYear: true,
			cardHolder: true,
			isDefault: true,
			isActive: true,
			createdAt: true,
			updatedAt: true,
		},
	},
	status: true,
	subtotal: true,
	deliveryFee: true,
	discount: true,
	total: true,
	notes: true,
	estimatedDelivery: true,
	deliveredAt: true,
	createdAt: true,
	updatedAt: true,
	items: {
		select: {
			id: true,
			orderId: true,
			productId: true,
			product: {
				select: {
					id: true,
					name: true,
					description: true,
					imageUrl: true,
				},
			},
			quantity: true,
			price: true,
			notes: true,
		},
	},
} satisfies Prisma.OrderSelect;

export type AdminOrderRecord = Prisma.OrderGetPayload<{
	select: typeof adminOrderSelect;
}>;

export type ClientOrderRecord = Prisma.OrderGetPayload<{
	select: typeof clientOrderSelect;
}>;

export interface AdminOrderRepository {
	findById(id: string): Promise<AdminOrderRecord | null>;
	findMany(input?: {
		excludedStatuses?: OrderStatus[];
		status?: OrderStatus;
		storeId?: string;
	}): Promise<AdminOrderRecord[]>;
	updateStatus(id: string, status: OrderStatus): Promise<AdminOrderRecord | null>;
}

export interface ClientOrderRepository {
	createClientOrder(input: {
		addressId: string | null;
		deliveryFee: number;
		discount: number;
		items: Prisma.OrderItemCreateManyOrderInput[];
		notes?: string;
		paymentMethodId?: string;
		status: OrderStatus;
		storeId: string;
		subtotal: number;
		total: number;
		userId: string;
	}): Promise<ClientOrderRecord>;
	findActivePaymentMethodForUser(id: string, userId: string): Promise<{ id: string } | null>;
	findActiveProductsByIds(
		ids: string[],
		storeId: string
	): Promise<Array<{ id: string; price: unknown }>>;
	findActiveStoreById(id: string): Promise<{ addressId: string; id: string } | null>;
	findAddressForUser(id: string, userId: string): Promise<{ id: string } | null>;
	findAdminOrderById(id: string): Promise<AdminOrderRecord | null>;
}

export class PrismaAdminOrderRepository implements AdminOrderRepository {
	constructor(private readonly database: PrismaClient = prisma) {}

	async findById(id: string) {
		return this.database.order.findUnique({
			where: { id },
			select: adminOrderSelect,
		});
	}

	async findMany(
		input: { excludedStatuses?: OrderStatus[]; status?: OrderStatus; storeId?: string } = {}
	) {
		const statusFilter = input.status
			? input.status
			: input.excludedStatuses?.length
				? { notIn: input.excludedStatuses }
				: undefined;

		return this.database.order.findMany({
			where: {
				...(statusFilter && { status: statusFilter }),
				...(input.storeId && { storeId: input.storeId }),
			},
			orderBy: { createdAt: 'desc' },
			select: adminOrderSelect,
		});
	}

	async updateStatus(id: string, status: OrderStatus) {
		const existingOrder = await this.database.order.findUnique({
			where: { id },
			select: { id: true },
		});

		if (!existingOrder) {
			return null;
		}

		return this.database.order.update({
			where: { id },
			data: {
				deliveredAt: status === OrderStatus.DELIVERED ? new Date() : null,
				status,
			},
			select: adminOrderSelect,
		});
	}
}

export class PrismaClientOrderRepository implements ClientOrderRepository {
	constructor(private readonly database: PrismaClient = prisma) {}

	async createClientOrder(input: {
		addressId: string | null;
		deliveryFee: number;
		discount: number;
		items: Prisma.OrderItemCreateManyOrderInput[];
		notes?: string;
		paymentMethodId?: string;
		status: OrderStatus;
		storeId: string;
		subtotal: number;
		total: number;
		userId: string;
	}) {
		return this.database.order.create({
			data: {
				addressId: input.addressId,
				deliveryFee: input.deliveryFee,
				discount: input.discount,
				items: {
					createMany: {
						data: input.items,
					},
				},
				notes: input.notes,
				paymentMethodId: input.paymentMethodId,
				status: input.status,
				storeId: input.storeId,
				subtotal: input.subtotal,
				total: input.total,
				userId: input.userId,
			},
			select: clientOrderSelect,
		}) as Promise<ClientOrderRecord>;
	}

	async findActivePaymentMethodForUser(id: string, userId: string) {
		return this.database.paymentMethod.findFirst({
			where: { id, isActive: true, userId },
			select: { id: true },
		});
	}

	async findActiveProductsByIds(ids: string[], storeId: string) {
		return this.database.product.findMany({
			where: {
				id: { in: ids },
				isActive: true,
				stores: {
					some: {
						id: storeId,
					},
				},
			},
			select: {
				id: true,
				price: true,
			},
		});
	}

	async findActiveStoreById(id: string) {
		return this.database.store.findFirst({
			where: {
				id,
				isActive: true,
			},
			select: {
				addressId: true,
				id: true,
			},
		});
	}

	async findAddressForUser(id: string, userId: string) {
		return this.database.address.findFirst({
			where: { id, userId },
			select: { id: true },
		});
	}

	async findAdminOrderById(id: string) {
		return this.database.order.findUnique({
			where: { id },
			select: adminOrderSelect,
		});
	}
}

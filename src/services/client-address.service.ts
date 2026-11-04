import { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma.js';

// Legacy store addresses also have a userId; ownership alone does not make them
// personal addresses. Keep store addresses under the store management flow.
export function personalAddressWhere(userId: string): Prisma.AddressWhereInput {
	return { userId, stores: { none: {} } };
}

export type RemoveClientAddressResult = 'removed' | 'not_found' | 'in_use';

export class ClientAddressService {
	constructor(private readonly database = prisma) {}

	async remove(userId: string, id: string): Promise<RemoveClientAddressResult> {
		const address = await this.database.address.findFirst({
			where: { id, userId },
			select: { id: true, _count: { select: { stores: true } } },
		});
		if (!address) return 'not_found';
		if (address._count.stores > 0) return 'in_use';

		try {
			await this.database.address.delete({
				where: { ...personalAddressWhere(userId), id },
			});
			return 'removed';
		} catch (error) {
			if (error instanceof Prisma.PrismaClientKnownRequestError) {
				// The foreign key remains the final guard if a store links the address
				// concurrently. Never remove its store or bypass referential integrity.
				if (error.code === 'P2003') return 'in_use';
				if (error.code === 'P2025') return 'not_found';
			}
			throw error;
		}
	}
}

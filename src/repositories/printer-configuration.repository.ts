import type {
	CreatePrinterConfigurationDTO,
	SetPrinterAssignmentsDTO,
	UpdatePrinterConfigurationDTO,
} from '@delivery-cruzeiro/types';
import type { Prisma, PrismaClient } from '@prisma/client';
import { prisma } from '../lib/prisma.js';

export const printerConfigurationSelect = {
	id: true,
	storeId: true,
	connectionId: true,
	name: true,
	connectionStatus: true,
	isPrimary: true,
	createdAt: true,
	updatedAt: true,
	categories: { select: { categoryId: true }, orderBy: { createdAt: 'asc' as const } },
	subcategories: { select: { subcategoryId: true }, orderBy: { createdAt: 'asc' as const } },
} satisfies Prisma.PrinterConfigurationSelect;

export type PrinterConfigurationRecord = Prisma.PrinterConfigurationGetPayload<{
	select: typeof printerConfigurationSelect;
}>;

export interface PrinterConfigurationRepository {
	countByStore(storeId: string): Promise<number>;
	create(data: CreatePrinterConfigurationDTO, isPrimary: boolean): Promise<PrinterConfigurationRecord>;
	delete(id: string): Promise<void>;
	findById(id: string): Promise<PrinterConfigurationRecord | null>;
	hasStoreAccess(userId: string, role: string, storeId: string): Promise<boolean>;
	list(storeId: string): Promise<PrinterConfigurationRecord[]>;
	setAssignments(id: string, data: SetPrinterAssignmentsDTO): Promise<PrinterConfigurationRecord>;
	setPrimary(id: string, storeId: string): Promise<PrinterConfigurationRecord>;
	update(id: string, data: UpdatePrinterConfigurationDTO): Promise<PrinterConfigurationRecord>;
	validateAssignments(storeId: string, categoryIds: string[], subcategoryIds: string[]): Promise<boolean>;
}

export class PrismaPrinterConfigurationRepository implements PrinterConfigurationRepository {
	constructor(private readonly database: PrismaClient = prisma) {}

	countByStore(storeId: string) {
		return this.database.printerConfiguration.count({ where: { storeId } });
	}

	create(data: CreatePrinterConfigurationDTO, isPrimary: boolean) {
		return this.database.printerConfiguration.create({
			data: { ...data, isPrimary },
			select: printerConfigurationSelect,
		});
	}

	async delete(id: string) {
		await this.database.$transaction(async transaction => {
			const removed = await transaction.printerConfiguration.delete({
				where: { id },
				select: { isPrimary: true, storeId: true },
			});

			if (!removed.isPrimary) return;
			const replacement = await transaction.printerConfiguration.findFirst({
				where: { storeId: removed.storeId },
				orderBy: { createdAt: 'asc' },
				select: { id: true },
			});
			if (replacement) {
				await transaction.printerConfiguration.update({
					where: { id: replacement.id },
					data: { isPrimary: true },
				});
			}
		});
	}

	findById(id: string) {
		return this.database.printerConfiguration.findUnique({
			where: { id },
			select: printerConfigurationSelect,
		});
	}

	async hasStoreAccess(userId: string, role: string, storeId: string) {
		return Boolean(await this.database.store.findFirst({
			where: { id: storeId, ...(role !== 'SUPER_ADMIN' && { users: { some: { id: userId } } }) },
			select: { id: true },
		}));
	}

	list(storeId: string) {
		return this.database.printerConfiguration.findMany({
			where: { storeId },
			orderBy: [{ isPrimary: 'desc' }, { createdAt: 'asc' }],
			select: printerConfigurationSelect,
		});
	}

	async setAssignments(id: string, data: SetPrinterAssignmentsDTO) {
		const categoryIds = [...new Set(data.categoryIds)];
		const subcategoryIds = [...new Set(data.subcategoryIds)];
		await this.database.$transaction(async transaction => {
			await transaction.printerCategory.deleteMany({ where: { printerId: id } });
			await transaction.printerSubcategory.deleteMany({ where: { printerId: id } });
			if (categoryIds.length > 0) {
				await transaction.printerCategory.createMany({
					data: categoryIds.map(categoryId => ({ categoryId, printerId: id })),
				});
			}
			if (subcategoryIds.length > 0) {
				await transaction.printerSubcategory.createMany({
					data: subcategoryIds.map(subcategoryId => ({ printerId: id, subcategoryId })),
				});
			}
		});
		return this.database.printerConfiguration.findUniqueOrThrow({
			where: { id },
			select: printerConfigurationSelect,
		});
	}

	async setPrimary(id: string, storeId: string) {
		await this.database.$transaction(async transaction => {
			await transaction.printerConfiguration.updateMany({
				where: { storeId, isPrimary: true, id: { not: id } },
				data: { isPrimary: false },
			});
			await transaction.printerConfiguration.update({ where: { id }, data: { isPrimary: true } });
		});
		return this.database.printerConfiguration.findUniqueOrThrow({
			where: { id },
			select: printerConfigurationSelect,
		});
	}

	update(id: string, data: UpdatePrinterConfigurationDTO) {
		return this.database.printerConfiguration.update({
			where: { id },
			data: {
				...(data.name !== undefined && { name: data.name }),
				...(data.connectionStatus !== undefined && { connectionStatus: data.connectionStatus }),
			},
			select: printerConfigurationSelect,
		});
	}

	async validateAssignments(storeId: string, categoryIds: string[], subcategoryIds: string[]) {
		const uniqueCategories = [...new Set(categoryIds)];
		const uniqueSubcategories = [...new Set(subcategoryIds)];
		const [categoryCount, subcategoryCount] = await Promise.all([
			this.database.category.count({
				where: { id: { in: uniqueCategories }, stores: { some: { id: storeId } } },
			}),
			this.database.subcategory.count({
				where: { id: { in: uniqueSubcategories }, stores: { some: { id: storeId } } },
			}),
		]);
		return categoryCount === uniqueCategories.length && subcategoryCount === uniqueSubcategories.length;
	}
}

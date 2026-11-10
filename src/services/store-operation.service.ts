import {
	defaultStoreOperationSettings,
	storeOperationSettingsSchema,
	isOperationOpen,
} from '@delivery-cruzeiro/types';
import { prisma } from '../lib/prisma.js';

export class StoreOperationService {
	constructor(private readonly database = prisma) {}
	async get(storeId: string) {
		const row = await this.database.storeOperationSettings.findUnique({ where: { storeId } });
		return row
			? storeOperationSettingsSchema.parse(row.settings)
			: structuredClone(defaultStoreOperationSettings);
	}
	async availability(storeId: string) {
		const settings = await this.get(storeId);
		return {
			settings,
			isOpen: isOperationOpen(settings),
			serverTime: new Date().toISOString(),
		};
	}
}

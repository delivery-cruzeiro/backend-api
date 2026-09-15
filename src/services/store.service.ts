import { StoreRepository } from '../repositories/store.repository.js';

export const systemLayouts = ['QUIET_OPS', 'MOTION_CANVAS', 'CRAVE_MARKET'] as const;
export type SystemLayoutValue = (typeof systemLayouts)[number];

export class StoreService {
	constructor(private readonly repository = new StoreRepository()) {}

	async listActiveStores() {
		return this.repository.listActiveOptions();
	}

	async updateLayout(storeId: string, layout: SystemLayoutValue) {
		const store = await this.repository.findActiveById(storeId);

		if (!store) {
			throw new Error('STORE_NOT_FOUND');
		}

		return this.repository.updateLayout(storeId, layout);
	}
}

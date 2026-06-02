import { StoreRepository } from '../repositories/store.repository.js';

export class StoreService {
	constructor(private readonly repository = new StoreRepository()) {}

	async listActiveStores() {
		return this.repository.listActiveOptions();
	}
}

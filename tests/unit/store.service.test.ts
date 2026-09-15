import { describe, expect, it, vi } from 'vitest';
import type { StoreRepository } from '../../src/repositories/store.repository.js';
import { StoreService } from '../../src/services/store.service.js';

function createRepository() {
	return {
		findActiveById: vi.fn(),
		updateLayout: vi.fn(),
	} as unknown as StoreRepository;
}

describe('StoreService', () => {
	it('persiste o layout na loja ativa selecionada', async () => {
		const repository = createRepository();
		vi.mocked(repository.findActiveById).mockResolvedValue({
			addressId: 'address-1',
			id: 'store-1',
			isActive: true,
			name: 'Loja Centro',
			nickname: 'Centro',
		});
		vi.mocked(repository.updateLayout).mockResolvedValue({
			id: 'store-1',
			isActive: true,
			layout: 'CRAVE_MARKET',
			name: 'Loja Centro',
			nickname: 'Centro',
		});

		const result = await new StoreService(repository).updateLayout(
			'store-1',
			'CRAVE_MARKET'
		);

		expect(repository.updateLayout).toHaveBeenCalledWith('store-1', 'CRAVE_MARKET');
		expect(result.layout).toBe('CRAVE_MARKET');
	});

	it('nao atualiza uma loja inexistente ou inativa', async () => {
		const repository = createRepository();
		vi.mocked(repository.findActiveById).mockResolvedValue(null);

		await expect(
			new StoreService(repository).updateLayout('store-inativa', 'QUIET_OPS')
		).rejects.toThrow('STORE_NOT_FOUND');
		expect(repository.updateLayout).not.toHaveBeenCalled();
	});
});

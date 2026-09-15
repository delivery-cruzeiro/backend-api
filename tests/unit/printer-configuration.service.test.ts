import { PrinterConnectionStatus } from '@delivery-cruzeiro/types';
import { describe, expect, it, vi } from 'vitest';
import type {
	PrinterConfigurationRecord,
	PrinterConfigurationRepository,
} from '../../src/repositories/printer-configuration.repository.js';
import {
	PrinterConfigurationError,
	PrinterConfigurationService,
} from '../../src/services/printer-configuration.service.js';

function record(data: Partial<PrinterConfigurationRecord> = {}): PrinterConfigurationRecord {
	return {
		id: 'printer-1',
		storeId: 'store-1',
		connectionId: 'webserial:1:2:0',
		name: 'Caixa',
		connectionStatus: PrinterConnectionStatus.CONNECTED,
		isPrimary: false,
		createdAt: new Date('2026-09-03T12:00:00Z'),
		updatedAt: new Date('2026-09-03T12:00:00Z'),
		categories: [],
		subcategories: [],
		...data,
	};
}

function repository(overrides: Partial<PrinterConfigurationRepository> = {}) {
	const base: PrinterConfigurationRepository = {
		countByStore: vi.fn().mockResolvedValue(0),
		create: vi.fn().mockResolvedValue(record({ isPrimary: true })),
		delete: vi.fn().mockResolvedValue(undefined),
		findById: vi.fn().mockResolvedValue(record()),
		hasStoreAccess: vi.fn().mockResolvedValue(true),
		list: vi.fn().mockResolvedValue([]),
		setAssignments: vi.fn().mockResolvedValue(record()),
		setPrimary: vi.fn().mockResolvedValue(record({ isPrimary: true })),
		update: vi.fn().mockResolvedValue(record()),
		validateAssignments: vi.fn().mockResolvedValue(true),
	};
	return { ...base, ...overrides };
}

const actor = { id: 'user-1', role: 'ADMIN' };

describe('PrinterConfigurationService', () => {
	it('define automaticamente a primeira impressora da loja como principal', async () => {
		const repo = repository();
		const service = new PrinterConfigurationService(repo);
		const printer = await service.create({
			storeId: 'store-1',
			connectionId: 'webserial:1:2:0',
			name: 'Caixa',
			connectionStatus: PrinterConnectionStatus.CONNECTED,
		}, actor);

		expect(repo.create).toHaveBeenCalledWith(expect.any(Object), true);
		expect(printer.isPrimary).toBe(true);
	});

	it('troca a impressora principal por uma operacao atomica do repositorio', async () => {
		const repo = repository();
		const service = new PrinterConfigurationService(repo);
		await service.update('printer-1', { isPrimary: true }, actor);
		expect(repo.setPrimary).toHaveBeenCalledWith('printer-1', 'store-1');
	});

	it('rejeita categorias que nao pertencem a loja', async () => {
		const repo = repository({ validateAssignments: vi.fn().mockResolvedValue(false) });
		const service = new PrinterConfigurationService(repo);

		await expect(service.setAssignments('printer-1', {
			categoryIds: ['outside'],
			subcategoryIds: [],
		}, actor)).rejects.toEqual(expect.objectContaining<Partial<PrinterConfigurationError>>({
			statusCode: 400,
		}));
		expect(repo.setAssignments).not.toHaveBeenCalled();
	});
});

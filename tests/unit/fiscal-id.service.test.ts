import { describe, expect, it, vi } from 'vitest';
import type { FiscalSequenceRepository } from '../../src/repositories/fiscal.repository.js';
import type { SalesRepository } from '../../src/repositories/sales.repository.js';
import { FiscalAccessKeyBuilderService } from '../../src/services/fiscal/shared/sefaz/fiscal-access-key-builder.service.js';
import { FiscalCheckDigitService } from '../../src/services/fiscal/shared/sefaz/fiscal-check-digit.service.js';
import { FiscalIdService } from '../../src/services/fiscal/shared/sefaz/fiscal-id.service.js';
import { FiscalSequenceService } from '../../src/services/fiscal/shared/sefaz/fiscal-sequence.service.js';
import {
	FISCAL_DOCUMENT_MODELS,
	FISCAL_EMISSION_TYPES,
} from '../../src/services/fiscal/shared/types/fiscal-id.types.js';

describe('FiscalCheckDigitService', () => {
	it('calcula o digito verificador por modulo 11 da chave de acesso', () => {
		const service = new FiscalCheckDigitService();

		const digit = service.calculate('2526051234567800019965009000000001100018273');

		expect(digit).toBe('0');
	});

	it('rejeita chave parcial com tamanho invalido', () => {
		const service = new FiscalCheckDigitService();

		expect(() => service.calculate('123')).toThrow(
			'A chave parcial fiscal deve conter exatamente 43 digitos'
		);
	});
});

describe('FiscalAccessKeyBuilderService', () => {
	it('gera chave de acesso e atributo Id com os campos fiscais formatados', () => {
		const service = new FiscalAccessKeyBuilderService();

		const identity = service.build({
			emissionType: FISCAL_EMISSION_TYPES.NORMAL,
			invoiceNumber: 1,
			issueDate: new Date('2026-05-11T12:00:00.000Z'),
			issuerCnpj: '12.345.678/0001-99',
			model: FISCAL_DOCUMENT_MODELS.NFCE,
			orderNumber: 18273,
			serie: '009',
			stateCode: '25',
		});

		expect(identity).toMatchObject({
			accessKey: '25260512345678000199650090000000011000182730',
			checkDigit: '0',
			emissionType: FISCAL_EMISSION_TYPES.NORMAL,
			fiscalId: 'NFe25260512345678000199650090000000011000182730',
			fiscalNumber: '000000001',
			model: FISCAL_DOCUMENT_MODELS.NFCE,
			numericCode: '00018273',
			serie: '009',
		});
	});

	it('trunca o codigo numerico para oito digitos quando o pedido ultrapassa o limite', () => {
		const service = new FiscalAccessKeyBuilderService();

		const identity = service.build({
			emissionType: FISCAL_EMISSION_TYPES.NORMAL,
			invoiceNumber: 2,
			issueDate: new Date('2026-05-11T12:00:00.000Z'),
			issuerCnpj: '12345678000199',
			model: FISCAL_DOCUMENT_MODELS.NFE,
			orderNumber: 123456789,
			serie: '009',
			stateCode: '25',
		});

		expect(identity.numericCode).toBe('23456789');
	});
});

describe('FiscalSequenceService', () => {
	it('reserva o proximo nNF usando modelo e serie fiscal', async () => {
		const repository: FiscalSequenceRepository = {
			reserveNextNumber: vi.fn().mockResolvedValue(16),
		};
		const service = new FiscalSequenceService(repository);

		await expect(
			service.reserveFiscalNumber({
				model: FISCAL_DOCUMENT_MODELS.NFE,
				serie: '009',
			})
		).resolves.toBe(16);
		expect(repository.reserveNextNumber).toHaveBeenCalledWith({
			model: FISCAL_DOCUMENT_MODELS.NFE,
			serie: '009',
		});
	});
});

describe('FiscalIdService', () => {
	it('busca o pedido, reserva nNF e gera a identidade fiscal', async () => {
		const salesRepository: SalesRepository = {
			findFiscalSaleById: vi.fn().mockResolvedValue({
				createdAt: new Date('2026-05-08T10:00:00.000Z'),
				id: 'order-1',
				orderNumber: 18273,
			}),
		};
		const sequenceRepository: FiscalSequenceRepository = {
			reserveNextNumber: vi.fn().mockResolvedValue(1),
		};
		const service = new FiscalIdService(
			salesRepository,
			new FiscalSequenceService(sequenceRepository),
			new FiscalAccessKeyBuilderService()
		);

		const result = await service.createForOrder({
			issueDate: new Date('2026-05-11T12:00:00.000Z'),
			issuerCnpj: '12345678000199',
			model: FISCAL_DOCUMENT_MODELS.NFCE,
			orderId: 'order-1',
			stateCode: '25',
		});

		expect(result).toMatchObject({
			identity: {
				accessKey: '25260512345678000199650090000000011000182730',
				fiscalId: 'NFe25260512345678000199650090000000011000182730',
				fiscalNumber: '000000001',
				numericCode: '00018273',
			},
			success: true,
		});
		expect(sequenceRepository.reserveNextNumber).toHaveBeenCalledWith({
			model: FISCAL_DOCUMENT_MODELS.NFCE,
			serie: '009',
		});
	});

	it('retorna erro quando o pedido nao existe', async () => {
		const salesRepository: SalesRepository = {
			findFiscalSaleById: vi.fn().mockResolvedValue(null),
		};
		const sequenceRepository: FiscalSequenceRepository = {
			reserveNextNumber: vi.fn(),
		};
		const service = new FiscalIdService(
			salesRepository,
			new FiscalSequenceService(sequenceRepository)
		);

		const result = await service.createForOrder({
			issuerCnpj: '12345678000199',
			model: FISCAL_DOCUMENT_MODELS.NFE,
			orderId: 'missing-order',
			stateCode: '25',
		});

		expect(result).toEqual({
			error: 'Pedido nao encontrado',
			statusCode: 404,
			success: false,
		});
		expect(sequenceRepository.reserveNextNumber).not.toHaveBeenCalled();
	});
});

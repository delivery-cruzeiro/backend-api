import { FiscalDocumentStatus, FiscalDocumentType } from '@prisma/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type {
	FiscalDocumentRepository,
	FiscalSequenceRepository,
	SaveFiscalDocumentInput,
} from '../../src/repositories/fiscal.repository.js';
import type { FiscalSaleRecord, SalesRepository } from '../../src/repositories/sales.repository.js';
import { FiscalEmissionService } from '../../src/services/fiscal/shared/fiscal-emission.service.js';
import { FiscalSequenceService } from '../../src/services/fiscal/shared/sefaz/fiscal-sequence.service.js';
import type { SefazGateway } from '../../src/services/fiscal/shared/sefaz/sefaz-gateway.service.js';
import type { SignXmlService } from '../../src/services/fiscal/shared/signing/sign-xml.service.js';
import type { FiscalXmlBuildInput } from '../../src/services/fiscal/shared/types/fiscal-emission.types.js';
import { FISCAL_DOCUMENT_MODELS } from '../../src/services/fiscal/shared/types/fiscal-id.types.js';

const baseSale: FiscalSaleRecord = {
	address: {
		city: 'Campina Grande',
		complement: null,
		neighborhood: 'Centro',
		number: '100',
		state: 'PB',
		street: 'Rua Teste',
		zipCode: '58400000',
	},
	createdAt: new Date('2026-05-11T10:00:00.000Z'),
	deliveryFee: 0,
	discount: 0,
	id: 'order-1',
	items: [
		{
			id: 'item-1',
			price: 20,
			product: {
				id: 'product-1',
				name: 'Pizza',
			},
			productId: 'product-1',
			quantity: 2,
		},
	],
	notes: null,
	orderNumber: 18273,
	store: {
		address: {
			city: 'Campina Grande',
			complement: null,
			neighborhood: 'Cruzeiro',
			number: '250',
			state: 'PB',
			street: 'Avenida Francisco Lopes de Almeida',
			zipCode: '58417-290',
		},
		cnpj: '18.016.122/0001-31',
		id: 'store-1',
		name: 'Loja 1',
		nickname: 'Pastel do cruzeiro - Loja 1',
		phoneNumber: '83 3335 1491',
	},
	storeId: 'store-1',
	subtotal: 40,
	total: 40,
	user: {
		email: 'cliente@example.com',
		name: 'Cliente Teste',
		phone: null,
	},
};

const xmlBuilder = {
	execute: vi.fn((input: FiscalXmlBuildInput) => ({
		referenceId: input.identity.fiscalId,
		xml: `<NFe><infNFe Id="${input.identity.fiscalId}"></infNFe></NFe>`,
	})),
};

describe('FiscalEmissionService', () => {
	let savedDocuments: SaveFiscalDocumentInput[];
	let salesRepository: SalesRepository;
	let fiscalDocumentRepository: FiscalDocumentRepository;
	let sequenceRepository: FiscalSequenceRepository;
	let signXmlService: SignXmlService;
	let sefazGateway: SefazGateway;

	beforeEach(() => {
		delete process.env.FISCAL_CITY_CODE;
		delete process.env.FISCAL_ISSUER_CNPJ;
		delete process.env.FISCAL_ISSUER_NAME;
		delete process.env.FISCAL_STATE_CODE;
		savedDocuments = [];
		salesRepository = {
			findFiscalSaleById: vi.fn().mockResolvedValue(baseSale),
		};
		fiscalDocumentRepository = {
			save: vi.fn(async input => {
				savedDocuments.push(input);

				return {
					accessKey: input.accessKey,
					emissionType: input.emissionType,
					fiscalNumber: input.fiscalNumber,
					id: `fiscal-${savedDocuments.length}`,
					model: input.model,
					orderId: input.orderId,
					protocol: input.protocol ?? null,
					qrCodeUrl: null,
					serie: input.serie,
					status: input.status,
					type: input.type,
					xmlPath: input.xmlPath ?? null,
				};
			}),
			updateQrCodeUrl: vi.fn(async (id, qrCodeUrl) => ({
				accessKey: savedDocuments[0]?.accessKey ?? null,
				emissionType: savedDocuments[0]?.emissionType ?? null,
				fiscalNumber: savedDocuments[0]?.fiscalNumber ?? null,
				id,
				model: savedDocuments[0]?.model ?? null,
				orderId: savedDocuments[0]?.orderId ?? 'order-1',
				protocol: savedDocuments[0]?.protocol ?? null,
				qrCodeUrl,
				serie: savedDocuments[0]?.serie ?? null,
				status: savedDocuments[0]?.status ?? FiscalDocumentStatus.AUTHORIZED,
				type: savedDocuments[0]?.type ?? FiscalDocumentType.NFCE,
				xmlPath: savedDocuments[0]?.xmlPath ?? null,
			})),
		};
		sequenceRepository = {
			reserveNextNumber: vi.fn().mockResolvedValue(1),
		};
		signXmlService = {
			sign: vi.fn(async input => ({
				certificateBase64: 'CERT',
				referenceUri: `#${input.referenceId}`,
				signatureXml: '<Signature />',
				signedXml: `<signed>${input.referenceId}</signed>`,
			})),
		} as unknown as SignXmlService;
		sefazGateway = {
			transmit: vi.fn().mockResolvedValue({
				protocol: '123',
				rawResponse: '<cStat>100</cStat><nProt>123</nProt>',
				status: 'AUTHORIZED',
				statusCode: '100',
				statusMessage: 'Autorizado',
			}),
		};
		xmlBuilder.execute.mockClear();
	});

	it('emite NF-e, assina, transmite e persiste documento autorizado', async () => {
		const service = createService();

		const result = await service.emit({
			allowOfflineContingency: false,
			documentType: FiscalDocumentType.NFE,
			model: FISCAL_DOCUMENT_MODELS.NFE,
			orderId: 'order-1',
			xmlBuilder,
		});

		expect(result).toMatchObject({
			protocol: '123',
			status: FiscalDocumentStatus.AUTHORIZED,
			success: true,
		});
		expect(sequenceRepository.reserveNextNumber).toHaveBeenCalledWith({
			model: FISCAL_DOCUMENT_MODELS.NFE,
			serie: '009',
		});
		expect(savedDocuments).toHaveLength(1);
		expect(savedDocuments[0]).toMatchObject({
			emissionType: '1',
			fiscalNumber: '000000001',
			model: FISCAL_DOCUMENT_MODELS.NFE,
			orderId: 'order-1',
			protocol: '123',
			status: FiscalDocumentStatus.AUTHORIZED,
			type: FiscalDocumentType.NFE,
		});
		expect(savedDocuments[0]?.xmlContent).toContain('<signed>');
		expect(xmlBuilder.execute).toHaveBeenCalledWith(
			expect.objectContaining({
				issuer: expect.objectContaining({
					cityCode: '2504009',
					cnpj: '18.016.122/0001-31',
					name: 'Loja 1',
					stateCode: '25',
					storeId: 'store-1',
					tradeName: 'Pastel do cruzeiro - Loja 1',
				}),
			})
		);
	});

	it('salva NFC-e em contingencia offline com tpEmis 9 quando ha erro de conexao', async () => {
		vi.mocked(sefazGateway.transmit).mockResolvedValue({
			connectionError: true,
			rawResponse: 'timeout',
			status: 'REJECTED',
			statusMessage: 'Erro de conexao com a SEFAZ',
		});
		const service = createService();

		const result = await service.emit({
			allowOfflineContingency: true,
			documentType: FiscalDocumentType.NFCE,
			model: FISCAL_DOCUMENT_MODELS.NFCE,
			orderId: 'order-1',
			xmlBuilder,
		});

		expect(result).toMatchObject({
			status: FiscalDocumentStatus.CONTINGENCY,
			success: true,
		});
		expect(savedDocuments).toHaveLength(1);
		expect(savedDocuments[0]).toMatchObject({
			emissionType: '9',
			fiscalNumber: '000000001',
			model: FISCAL_DOCUMENT_MODELS.NFCE,
			status: FiscalDocumentStatus.CONTINGENCY,
			type: FiscalDocumentType.NFCE,
		});
		expect(savedDocuments[0]?.sefazResponse).toMatchObject({
			connectionError: true,
			rawResponse: 'timeout',
		});
		expect(vi.mocked(signXmlService.sign)).toHaveBeenCalledTimes(2);
	});

	it('emite documento fiscal de teste usando endpoint de homologacao', async () => {
		const service = createService();

		const result = await service.emit({
			allowOfflineContingency: false,
			documentType: FiscalDocumentType.NFCE,
			model: FISCAL_DOCUMENT_MODELS.NFCE,
			orderId: 'order-1',
			test: true,
			xmlBuilder,
		});

		expect(result).toMatchObject({
			protocol: '123',
			signedXml: expect.stringContaining('<signed>'),
			status: FiscalDocumentStatus.AUTHORIZED,
			success: true,
		});
		expect(sefazGateway.transmit).toHaveBeenCalledWith({
			documentType: FiscalDocumentType.NFCE,
			signedXml: expect.stringContaining('<signed>'),
			test: true,
		});
		expect(xmlBuilder.execute).toHaveBeenCalledWith(
			expect.objectContaining({
				test: true,
			})
		);
		expect(savedDocuments).toHaveLength(1);
		expect(savedDocuments[0]).toMatchObject({
			emissionType: '1',
			fiscalNumber: '000000001',
			model: FISCAL_DOCUMENT_MODELS.NFCE,
			orderId: 'order-1',
			protocol: '123',
			status: FiscalDocumentStatus.AUTHORIZED,
			type: FiscalDocumentType.NFCE,
		});
		expect(savedDocuments[0]?.sefazResponse).toMatchObject({
			statusCode: '100',
			testMode: true,
			transmitted: true,
		});
		expect(savedDocuments[0]?.xmlContent).toContain('<signed>');
	});

	it('gera DANFE NFC-e para impressao quando solicitado', async () => {
		const danfeGenerator = {
			execute: vi.fn(() => ({
				accessKey: 'access-key',
				columns: 48 as const,
				contentBase64: 'G0AK',
				encoding: 'base64' as const,
				format: 'ESC_POS' as const,
				qrCodeUrl: 'https://sefaz.example/qrcode?p=access-key',
			})),
		};
		const service = createService(danfeGenerator);

		const result = await service.emit({
			allowOfflineContingency: true,
			documentType: FiscalDocumentType.NFCE,
			generateDanfe: true,
			model: FISCAL_DOCUMENT_MODELS.NFCE,
			orderId: 'order-1',
			xmlBuilder,
		});

		expect(result).toMatchObject({
			danfe: {
				contentBase64: 'G0AK',
				format: 'ESC_POS',
				qrCodeUrl: 'https://sefaz.example/qrcode?p=access-key',
			},
			status: FiscalDocumentStatus.AUTHORIZED,
			success: true,
		});
		expect(danfeGenerator.execute).toHaveBeenCalledWith({
			protocol: '123',
			xml: expect.stringContaining('<signed>'),
		});
		expect(fiscalDocumentRepository.updateQrCodeUrl).toHaveBeenCalledWith(
			'fiscal-1',
			'https://sefaz.example/qrcode?p=access-key'
		);
	});

	it('retorna erro quando a loja do pedido nao tem configuracao fiscal completa', async () => {
		const store = baseSale.store;

		if (!store) {
			throw new Error('baseSale deve ter loja para este teste');
		}

		vi.mocked(salesRepository.findFiscalSaleById).mockResolvedValue({
			...baseSale,
			store: {
				...store,
				cnpj: null,
			},
		});
		const service = createService();

		const result = await service.emit({
			allowOfflineContingency: false,
			documentType: FiscalDocumentType.NFE,
			model: FISCAL_DOCUMENT_MODELS.NFE,
			orderId: 'order-1',
			test: true,
			xmlBuilder,
		});

		expect(result).toEqual({
			error: 'Configuracao fiscal da loja incompleta',
			statusCode: 500,
			success: false,
		});
		expect(sequenceRepository.reserveNextNumber).not.toHaveBeenCalled();
		expect(xmlBuilder.execute).not.toHaveBeenCalled();
		expect(savedDocuments).toHaveLength(0);
	});

	function createService(
		danfeGenerator?: ConstructorParameters<typeof FiscalEmissionService>[7]
	) {
		return new FiscalEmissionService(
			salesRepository,
			fiscalDocumentRepository,
			new FiscalSequenceService(sequenceRepository),
			undefined,
			signXmlService,
			sefazGateway,
			undefined,
			danfeGenerator
		);
	}
});

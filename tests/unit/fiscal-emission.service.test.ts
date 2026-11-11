import { describe, expect, it, vi } from 'vitest';
import type { PrismaFiscalDocumentRepository } from '../../src/repositories/fiscal.repository.js';
import { FiscalWorker } from '../../src/services/fiscal/shared/fiscal-worker.service.js';
import { prepareFiscalSale } from '../../src/services/fiscal/shared/validators/fiscal-sale.validator.js';
import { BuildNfceXmlService } from '../../src/services/fiscal/nfce/build-nfce-xml.service.js';
import { FiscalAccessKeyBuilderService } from '../../src/services/fiscal/shared/sefaz/fiscal-access-key-builder.service.js';

const record = {
	id: 'fiscal-1',
	order: { status: 'CONFIRMED' },
	environment: '2',
	issuerCnpj: '12345678000195',
	createdAt: new Date(),
	accessKey: '25261112345678000195650090000000011000182735',
	xmlContent: '<NFe/>',
	type: 'NFCE',
	receipt: null,
};

function worker(status: string) {
	const finish = vi.fn();
	const repository = {
		claim: vi.fn().mockResolvedValue({ document: { ...record, status }, leaseToken: 'lease' }),
		finish,
	};
	const gateway = {
		transmit: vi.fn().mockResolvedValue({ status: 'AWAITING_SEFAZ', statusMessage: 'timeout' }),
		reconcile: vi.fn().mockResolvedValue({
			status: 'AUTHORIZED',
			protocol: '325260000000001',
			authorizedAt: new Date('2026-11-10T12:00:00Z'),
			statusCode: '100',
			protocolXml: '<protNFe/>',
		}),
	};
	const validate = vi.fn();
	const service = new FiscalWorker(
		repository as unknown as PrismaFiscalDocumentRepository,
		gateway,
		validate
	);
	return { service, gateway, finish, validate };
}

describe('processador fiscal', () => {
	it('preserva uma tentativa incerta para consulta futura', async () => {
		const { service, finish, gateway } = worker('PENDING');
		await service.runOne();
		expect(gateway.transmit).toHaveBeenCalledExactlyOnceWith(
			expect.objectContaining({ accessKey: record.accessKey })
		);
		expect(finish).toHaveBeenCalledWith(
			record.id,
			'lease',
			expect.objectContaining({ status: 'AWAITING_SEFAZ' })
		);
	});

	it.each(['PROCESSING', 'AWAITING_SEFAZ'])(
		'consulta e salva o XML processado a partir de %s',
		async status => {
			const { service, finish, gateway, validate } = worker(status);
			await service.runOne();
			expect(gateway.transmit).not.toHaveBeenCalled();
			expect(gateway.reconcile).toHaveBeenCalledWith(
				expect.objectContaining({ accessKey: record.accessKey }),
				null
			);
			expect(validate).toHaveBeenCalledWith(
				expect.stringContaining('<NFe/><protNFe/>'),
				'procNFe'
			);
			expect(finish).toHaveBeenCalledWith(
				record.id,
				'lease',
				expect.objectContaining({
					status: 'AUTHORIZED',
					protocol: '325260000000001',
					authorizedHash: expect.stringMatching(/^[a-f0-9]{64}$/),
				})
			);
		}
	);
});

const address = {
	city: 'Campina Grande',
	state: 'PB',
	street: 'Rua Teste',
	number: '1',
	neighborhood: 'Centro',
	zipCode: '58400000',
};
const tax = {
	ncm: '19059090',
	cfop: '5102',
	unit: 'UN',
	origin: '0',
	gtin: 'SEM GTIN',
	taxProfile: 'SN102_PIS99_COFINS99',
};
function sale(override: Record<string, unknown> = {}) {
	return {
		status: 'CONFIRMED',
		orderNumber: 42,
		address,
		paymentType: 'PIX',
		payments: [],
		subtotal: 20,
		deliveryFee: 2.01,
		discount: 1.01,
		total: 21,
		paymentAdditionalValue: 0,
		user: { cpf: '52998224725', name: 'Consumidor' },
		items: ['a', 'b'].map(productId => ({
			productId,
			price: 10,
			quantity: 1,
			product: { name: 'Teste', fiscalData: { '65': tax } },
		})),
		store: {
			address,
			cnpj: '12345678000195',
			name: 'Loja',
			nickname: 'Loja',
			fiscalProfile: {
				ie: '160000000',
				crt: '1',
				homologation: {
					enabled: true,
					enable65: true,
					allowDelivery: true,
					staticPix: true,
					serie65: '9',
					lastNumber65: 0,
				},
			},
		},
		...override,
	} as unknown as Parameters<typeof prepareFiscalSale>[0];
}

describe('dados da venda fiscal', () => {
	it('distingue entrega desabilitada de identificação do destinatário ausente', () => {
		const original = sale({ user: null });
		const profile = original.store!.fiscalProfile as Record<string, unknown>;
		const setup = profile.homologation as Record<string, unknown>;
		setup.allowDelivery = false;
		expect(() => prepareFiscalSale(original, '2')).toThrow(
			'emissão com entrega está desabilitada em homologação'
		);
		setup.allowDelivery = true;
		expect(() => prepareFiscalSale(original, '2')).toThrow(
			'Informe o CPF/CNPJ do destinatário'
		);
	});

	it('identifica qual modelo está desabilitado para o ambiente', () => {
		const original = sale();
		const profile = original.store!.fiscalProfile as Record<string, unknown>;
		(profile.homologation as Record<string, unknown>).enable65 = false;
		expect(() => prepareFiscalSale(original, '2')).toThrow(
			'NFC-e (65) não está habilitado em homologação'
		);
	});
	it('herda dados da categoria e tributos da loja, com exceções no produto', () => {
		const original = sale();
		const store = {
			...original.store,
			fiscalProfile: {
				...(original.store.fiscalProfile as Record<string, unknown>),
				taxDefaults: { csosn: '102', pisCst: '99', cofinsCst: '99' },
			},
		};
		const category = {
			fiscalData: { unit: 'UN', origin: '0', gtin: 'SEM GTIN' },
			fiscalOperation: { code: '5101', classification: { ncm: '19059090' } },
		};
		const items = original.items.map(item => ({
			...item,
			product: {
				...item.product,
				fiscalData: null as unknown,
				fiscalOperation: null as unknown,
				category,
			},
		}));
		expect(prepareFiscalSale(sale({ store, items }), '2').snapshot.items[0]).toMatchObject({
			unit: 'UN',
			origin: '0',
			gtin: 'SEM GTIN',
			csosn: '102',
			pisCst: '99',
			cofinsCst: '99',
		});
		items[0].product.fiscalData = { unit: 'KG', csosn: '500' };
		items[0].product.fiscalOperation = { code: '5405', classification: { ncm: '19059090' } };
		expect(prepareFiscalSale(sale({ store, items }), '2').snapshot.items[0]).toMatchObject({
			unit: 'KG',
			cfop: '5405',
			csosn: '500',
		});
		items[0].product.fiscalData = { unit: null, csosn: null };
		items[0].product.fiscalOperation = null;
		expect(prepareFiscalSale(sale({ store, items }), '2').snapshot.items[0]).toMatchObject({
			unit: 'UN',
			csosn: '102',
		});
	});

	it('não assume tributos quando a loja não os cadastrou', () => {
		const original = sale();
		const items = original.items.map(item => ({
			...item,
			product: {
				...item.product,
				fiscalData: { ...tax, taxProfile: undefined },
			},
		}));
		expect(() => prepareFiscalSale(sale({ items }), '2')).toThrow('classificação fiscal');
	});

	it('usa os padrões da loja do pedido e bloqueia ST incompatível', () => {
		const original = sale();
		const items = original.items.map(item => ({
			...item,
			product: {
				...item.product,
				fiscalData: { ...tax, taxProfile: undefined },
			},
		}));
		const withTaxes = (csosn: string) =>
			sale({
				items,
				store: {
					...original.store,
					fiscalProfile: {
						...(original.store.fiscalProfile as Record<string, unknown>),
						taxDefaults: { csosn, pisCst: '99', cofinsCst: '99' },
					},
				},
			});
		expect(prepareFiscalSale(withTaxes('102'), '2').snapshot.items[0].csosn).toBe('102');
		expect(() => prepareFiscalSale(withTaxes('500'), '2')).toThrow('classificação fiscal');
	});

	it('usa o cadastro fiscal da loja vinculada a cada venda', () => {
		const first = sale();
		const second = sale({
			store: {
				...first.store,
				cnpj: '11222333000181',
				name: 'Outra loja',
				nickname: 'Outra loja',
				fiscalProfile: {
					...(first.store.fiscalProfile as Record<string, unknown>),
					ie: '160000001',
				},
			},
		});
		expect(prepareFiscalSale(first, '2').snapshot.issuer).toMatchObject({
			cnpj: '12345678000195',
			ie: '160000000',
			crt: '1',
			name: 'Loja',
		});
		expect(prepareFiscalSale(second, '2').snapshot.issuer).toMatchObject({
			cnpj: '11222333000181',
			ie: '160000001',
			crt: '1',
			name: 'Outra loja',
		});
	});

	it.each([{ ie: undefined }, { crt: undefined }, { crt: '3' }])(
		'bloqueia cadastro ausente ou regime ainda não suportado sem assumir valores',
		override => {
			const original = sale();
			const store = {
				...original.store,
				fiscalProfile: {
					...(original.store.fiscalProfile as Record<string, unknown>),
					...override,
				},
			};
			expect(() => prepareFiscalSale(sale({ store }), '2')).toThrow();
		}
	);

	it('herda NCM e operação da categoria e prioriza a escolha do produto', () => {
		const original = sale();
		const categoryOperation = { code: '5101', classification: { ncm: '21069090' } };
		const productOperation = { code: '5102', classification: { ncm: '19059090' } };
		const items = original.items.map(item => ({
			...item,
			product: {
				...item.product,
				fiscalOperation: null as typeof productOperation | null,
				category: { fiscalOperation: categoryOperation },
			},
		}));
		const inherited = prepareFiscalSale(sale({ items }), '2');
		expect(inherited.snapshot.items[0]).toMatchObject({ ncm: '21069090', cfop: '5101' });
		items[0].product.fiscalOperation = productOperation;
		const overridden = prepareFiscalSale(sale({ items }), '2');
		expect(overridden.snapshot.items[0]).toMatchObject({ ncm: '19059090', cfop: '5102' });
		expect(overridden.snapshot.items[1]).toMatchObject({ ncm: '21069090', cfop: '5101' });
		items[0].product.fiscalOperation = null;
		expect(prepareFiscalSale(sale({ items }), '2').snapshot.items[0]).toMatchObject({
			ncm: '21069090',
			cfop: '5101',
		});
	});

	it('gera NFC-e de homologação para retirada sem identificar o cliente', () => {
		vi.stubEnv('NFCE_QRCODE_URL_HOMOLOGATION', 'http://www.sefaz.pb.gov.br/nfcehom');
		vi.stubEnv('NFCE_ACCESS_KEY_URL_HOMOLOGATION', 'https://www.sefaz.pb.gov.br/nfcehom/');
		try {
			const { model, snapshot } = prepareFiscalSale(
				sale({
					address: null,
					user: null,
					deliveryFee: 0,
					discount: 0,
					total: 20,
				}),
				'2'
			);
			const issuedAt = new Date('2026-11-10T15:00:00-03:00');
			const identity = new FiscalAccessKeyBuilderService().build({
				emissionType: '1',
				invoiceNumber: 1,
				issueDate: issuedAt,
				issuerCnpj: snapshot.issuer.cnpj,
				model,
				numericCode: '00018273',
				orderNumber: 42,
				serie: '009',
				stateCode: '25',
			});
			const { xml } = new BuildNfceXmlService().execute({
				identity,
				sale: snapshot,
				issuedAt,
				environment: '2',
			});
			expect(model).toBe('65');
			expect(snapshot.recipient).toBeUndefined();
			expect(xml).toContain('<tpAmb>2</tpAmb>');
			expect(xml).toContain('<CNPJ>' + snapshot.issuer.cnpj + '</CNPJ>');
			expect(xml).toContain('<IE>' + snapshot.issuer.ie + '</IE>');
			expect(xml).toContain('<CRT>' + snapshot.issuer.crt + '</CRT>');
			expect(xml).not.toContain('<dest>');
		} finally {
			vi.unstubAllEnvs();
		}
	});

	it('rateia valores por centavo e declara Pix estático explicitamente', () => {
		const { snapshot } = prepareFiscalSale(sale(), '2');
		expect(snapshot.payment).toBe('20');
		expect(snapshot.items.map(({ discount, freight }) => [discount, freight])).toEqual([
			[50, 100],
			[51, 101],
		]);
	});
	it.each([
		{ status: 'CANCELLED' },
		{ paymentType: 'CREDIT_CARD' },
		{ total: 20 },
		{ user: null },
	])('bloqueia operação sem dados compatíveis antes da sequência', override => {
		expect(() => prepareFiscalSale(sale(override), '2')).toThrow();
	});
});

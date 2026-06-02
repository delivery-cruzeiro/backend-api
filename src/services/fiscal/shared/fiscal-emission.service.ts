import { FiscalDocumentStatus, FiscalDocumentType } from '@prisma/client';
import {
	PrismaFiscalDocumentRepository,
	type FiscalDocumentRecord,
	type FiscalDocumentRepository,
} from '../../../repositories/fiscal.repository.js';
import { GenerateDanfeNfceService } from '../danfe/generate-danfe-nfce.service.js';
import type { DanfeNfcePrintPayload } from '../danfe/danfe-nfce.types.js';
import {
	PrismaSalesRepository,
	type FiscalSaleRecord,
	type SalesRepository,
} from '../../../repositories/sales.repository.js';
import { FiscalAccessKeyBuilderService } from './sefaz/fiscal-access-key-builder.service.js';
import { FiscalSequenceService } from './sefaz/fiscal-sequence.service.js';
import { SefazGatewayService, type SefazGateway } from './sefaz/sefaz-gateway.service.js';
import { SignXmlService } from './signing/sign-xml.service.js';
import { getFiscalCityCode, getFiscalStateCode } from './fiscal-location-codes.js';
import type {
	FiscalEmissionResult,
	FiscalIssuerConfig,
	FiscalXmlBuildInput,
	FiscalXmlBuildResult,
	SefazTransmitResult,
} from './types/fiscal-emission.types.js';
import {
	DEFAULT_FISCAL_SERIE,
	FISCAL_EMISSION_TYPES,
	type FiscalDocumentModel,
	type FiscalEmissionType,
	type FiscalIdentity,
} from './types/fiscal-id.types.js';
import { FiscalSaleValidator } from './validators/fiscal-sale.validator.js';

interface FiscalXmlBuilder {
	execute(input: FiscalXmlBuildInput): FiscalXmlBuildResult;
}

export interface EmitFiscalDocumentInput {
	allowOfflineContingency: boolean;
	documentType: FiscalDocumentType;
	generateDanfe?: boolean;
	model: FiscalDocumentModel;
	orderId: string;
	test?: boolean;
	xmlBuilder: FiscalXmlBuilder;
}

interface DanfeNfceGenerator {
	execute(input: {
		authorizationDate?: string | null;
		protocol?: string | null;
		xml: string;
	}): DanfeNfcePrintPayload;
}

export class FiscalEmissionService {
	constructor(
		private readonly salesRepository: SalesRepository = new PrismaSalesRepository(),
		private readonly fiscalDocumentRepository: FiscalDocumentRepository = new PrismaFiscalDocumentRepository(),
		private readonly fiscalSequenceService = new FiscalSequenceService(),
		private readonly accessKeyBuilder = new FiscalAccessKeyBuilderService(),
		private readonly signXmlService = new SignXmlService(),
		private readonly sefazGateway: SefazGateway = new SefazGatewayService(),
		private readonly saleValidator = new FiscalSaleValidator(),
		private readonly danfeNfceGenerator: DanfeNfceGenerator = new GenerateDanfeNfceService()
	) {}

	async emit(input: EmitFiscalDocumentInput): Promise<FiscalEmissionResult> {
		const sale = await this.salesRepository.findFiscalSaleById(input.orderId);

		if (!sale) {
			return {
				error: 'Pedido nao encontrado',
				statusCode: 404,
				success: false,
			};
		}

		const validationError = this.saleValidator.validate(sale, input.model);

		if (validationError) {
			return {
				error: validationError,
				statusCode: 400,
				success: false,
			};
		}

		const issuer = buildIssuerConfigFromSale(sale);

		if (!issuer) {
			return {
				error: 'Configuracao fiscal da loja incompleta',
				statusCode: 500,
				success: false,
			};
		}

		const serie = process.env.FISCAL_SERIE ?? DEFAULT_FISCAL_SERIE;
		const invoiceNumber = await this.fiscalSequenceService.reserveFiscalNumber({
			model: input.model,
			serie,
		});
		const normalEmission = await this.buildSignAndTransmit({
			documentType: input.documentType,
			emissionType: FISCAL_EMISSION_TYPES.NORMAL,
			input,
			invoiceNumber,
			issuer,
			sale,
			serie,
			test: input.test ?? false,
		});

		if (normalEmission.transmission.connectionError && input.allowOfflineContingency) {
			const contingency = await this.buildSignAndPersist({
				documentType: input.documentType,
				emissionType: FISCAL_EMISSION_TYPES.CONTINGENCY_NFCE,
				input,
				invoiceNumber,
				issuer,
				sale,
				serie,
				status: FiscalDocumentStatus.CONTINGENCY,
				transmission: normalEmission.transmission,
			});
			const danfe = input.generateDanfe
				? await this.generateAndAttachDanfe({
						document: contingency.document,
						protocol: contingency.document.protocol,
						signedXml: contingency.signedXml,
					})
				: undefined;

			return {
				accessKey: contingency.identity.accessKey,
				...(danfe ? { danfe } : {}),
				document: contingency.document,
				fiscalId: contingency.identity.fiscalId,
				message: 'NFC-e armazenada em contingencia offline para reenvio posterior',
				status: FiscalDocumentStatus.CONTINGENCY,
				success: true,
			};
		}

		const status =
			normalEmission.transmission.status === 'AUTHORIZED'
				? FiscalDocumentStatus.AUTHORIZED
				: FiscalDocumentStatus.REJECTED;
		const document = await this.persistFiscalDocument({
			documentType: input.documentType,
			identity: normalEmission.identity,
			orderId: sale.id,
			signedXml: normalEmission.signedXml,
			status,
			testMode: input.test ?? false,
			transmission: normalEmission.transmission,
		});
		const danfe =
			input.generateDanfe &&
			status === FiscalDocumentStatus.AUTHORIZED &&
			input.documentType === FiscalDocumentType.NFCE
				? await this.generateAndAttachDanfe({
						document,
						protocol: normalEmission.transmission.protocol,
						signedXml: normalEmission.signedXml,
					})
				: undefined;

		return {
			accessKey: normalEmission.identity.accessKey,
			...(danfe ? { danfe } : {}),
			document,
			fiscalId: normalEmission.identity.fiscalId,
			message:
				status === FiscalDocumentStatus.AUTHORIZED
					? 'Nota fiscal autorizada pela SEFAZ'
					: input.test
						? 'Nota fiscal de teste enviada para homologacao da SEFAZ'
						: 'Nota fiscal rejeitada pela SEFAZ',
			protocol: normalEmission.transmission.protocol,
			signedXml: input.test && !input.generateDanfe ? normalEmission.signedXml : undefined,
			status,
			success: true,
		};
	}

	private async buildSignAndTransmit(input: BuildSignInput) {
		const signed = await this.buildAndSign(input);
		const transmission = await this.sefazGateway.transmit({
			documentType: input.documentType,
			signedXml: signed.signedXml,
			test: input.test,
		});

		return {
			...signed,
			transmission,
		};
	}

	private async buildSignAndPersist(input: BuildSignInput & PersistContingencyInput) {
		const signed = await this.buildAndSign(input);
		const document = await this.persistFiscalDocument({
			documentType: input.documentType,
			identity: signed.identity,
			orderId: input.sale.id,
			signedXml: signed.signedXml,
			status: input.status,
			transmission: input.transmission,
		});

		return {
			...signed,
			document,
		};
	}

	private async buildAndSign(input: BuildSignInput) {
		const identity = this.accessKeyBuilder.build({
			emissionType: input.emissionType,
			invoiceNumber: input.invoiceNumber,
			issueDate: new Date(),
			issuerCnpj: input.issuer.cnpj,
			model: input.input.model,
			orderNumber: input.sale.orderNumber,
			serie: input.serie,
			stateCode: input.issuer.stateCode,
		});
		const xml = input.input.xmlBuilder.execute({
			identity,
			issuer: input.issuer,
			sale: input.sale,
			test: input.test,
		});
		const signed = await this.signXmlService.sign({
			referenceId: xml.referenceId,
			xml: xml.xml,
		});

		return {
			identity,
			signedXml: signed.signedXml,
		};
	}

	private async persistFiscalDocument(input: PersistFiscalDocumentInput) {
		return this.fiscalDocumentRepository.save({
			accessKey: input.identity.accessKey,
			emissionType: input.identity.emissionType,
			fiscalNumber: input.identity.fiscalNumber,
			model: input.identity.model,
			orderId: input.orderId,
			protocol: input.transmission.protocol,
			sefazResponse: {
				connectionError: input.transmission.connectionError ?? false,
				rawResponse: input.transmission.rawResponse ?? null,
				statusCode: input.transmission.statusCode ?? null,
				statusMessage: input.transmission.statusMessage ?? null,
				testMode: input.testMode ?? false,
				transmitted: true,
			},
			serie: input.identity.serie,
			status: input.status,
			type: input.documentType,
			xmlContent: input.signedXml,
			xmlPath: `fiscal_documents/${input.identity.accessKey}.xml`,
		});
	}

	private async generateAndAttachDanfe(input: GenerateAndAttachDanfeInput) {
		const danfe = this.danfeNfceGenerator.execute({
			protocol: input.protocol,
			xml: input.signedXml,
		});

		await this.fiscalDocumentRepository.updateQrCodeUrl(input.document.id, danfe.qrCodeUrl);

		return danfe;
	}
}

interface BuildSignInput {
	documentType: FiscalDocumentType;
	emissionType: FiscalEmissionType;
	input: EmitFiscalDocumentInput;
	invoiceNumber: number;
	issuer: FiscalIssuerConfig;
	sale: FiscalSaleRecord;
	serie: string;
	test?: boolean;
}

interface PersistContingencyInput {
	status: FiscalDocumentStatus;
	transmission: SefazTransmitResult;
}

interface PersistFiscalDocumentInput {
	documentType: FiscalDocumentType;
	identity: FiscalIdentity;
	orderId: string;
	signedXml: string;
	status: FiscalDocumentStatus;
	testMode?: boolean;
	transmission: SefazTransmitResult;
}

interface GenerateAndAttachDanfeInput {
	document: FiscalDocumentRecord;
	protocol?: string | null;
	signedXml: string;
}

function buildIssuerConfigFromSale(sale: FiscalSaleRecord): FiscalIssuerConfig | null {
	if (!sale.store?.cnpj) {
		return null;
	}

	const address = sale.store.address;
	const cityCode = getFiscalCityCode({
		city: address.city,
		state: address.state,
	});
	const stateCode = getFiscalStateCode(address.state);

	if (!cityCode || !stateCode) {
		return null;
	}

	return {
		address,
		cityCode,
		cnpj: sale.store.cnpj,
		name: sale.store.name,
		phoneNumber: sale.store.phoneNumber,
		stateCode,
		storeId: sale.store.id,
		tradeName: sale.store.nickname,
	};
}

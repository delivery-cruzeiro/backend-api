import { createHash, randomInt } from 'node:crypto';
import { Prisma, type FiscalDocument } from '@prisma/client';
import {
	PrismaFiscalDocumentRepository,
	PrismaFiscalSequenceRepository,
} from '../../../repositories/fiscal.repository.js';
import { PrismaSalesRepository } from '../../../repositories/sales.repository.js';
import { GenerateDanfeNfceService } from '../danfe/generate-danfe-nfce.service.js';
import { BuildNfeXmlService } from '../nfe/build-nfe-xml.service.js';
import { BuildNfceXmlService } from '../nfce/build-nfce-xml.service.js';
import { FiscalAccessKeyBuilderService } from './sefaz/fiscal-access-key-builder.service.js';
import { SignXmlService } from './signing/sign-xml.service.js';
import { FiscalXmlValidationError, validateFiscalXml } from './xml/validate-fiscal-xml.service.js';
import type { FiscalEnvironment } from './types/fiscal-emission.types.js';
import { FiscalInputError, prepareFiscalSale } from './validators/fiscal-sale.validator.js';

export class FiscalRequestError extends Error {
	constructor(
		readonly statusCode: number,
		message: string
	) {
		super(message);
	}
}

export function productionFiscalEnabled() {
	return process.env.FISCAL_PRODUCTION_ENABLED === 'true';
}

export class FiscalEmissionService {
	constructor(
		private readonly sales = new PrismaSalesRepository(),
		private readonly documents = new PrismaFiscalDocumentRepository(),
		private readonly sequence = new PrismaFiscalSequenceRepository(),
		private readonly signer = new SignXmlService(),
		private readonly verifyXml = validateFiscalXml
	) {}

	async enqueue(orderId: string, environment: FiscalEnvironment, expectedModel?: '55' | '65') {
		const existing = await this.documents.findForSale(orderId, environment);
		if (existing) return existingSummary(existing, expectedModel);
		if (environment === '1' && !productionFiscalEnabled()) {
			throw new FiscalRequestError(
				409,
				'Emissão de produção desabilitada para este ambiente.'
			);
		}
		const sale = await this.sales.findFiscalSaleById(orderId);
		if (!sale) throw new FiscalRequestError(404, 'Pedido não encontrado.');
		if (await this.documents.findLegacy(orderId, environment)) {
			throw new FiscalRequestError(
				409,
				'O pedido tem registro fiscal anterior. Concilie a chave antes de emitir.'
			);
		}

		let prepared: ReturnType<typeof prepareFiscalSale>;
		try {
			prepared = prepareFiscalSale(sale, environment);
		} catch (error) {
			if (error instanceof FiscalInputError) throw new FiscalRequestError(422, error.message);
			throw error;
		}
		const { model, serie, lastNumber, snapshot } = prepared;
		if (expectedModel && model !== expectedModel)
			throw new FiscalRequestError(422, `Este pedido usa o modelo ${model}.`);
		const cnpj = snapshot.issuer.cnpj;

		try {
			const queued = await this.documents.transaction(async () => {
				const document = await this.documents.createIntent(
					orderId,
					environment,
					cnpj,
					model === '55' ? 'NFE' : 'NFCE'
				);
				const invoiceNumber = await this.sequence.reserveNextNumber({
					model,
					serie,
					issuerCnpj: cnpj,
					environment,
					lastNumber,
				});
				const issuedAt = new Date();
				let numericCode: string;
				do {
					numericCode = String(randomInt(1, 100_000_000)).padStart(8, '0');
				} while (Number(numericCode) === invoiceNumber || /^(\d)\1{7}$/.test(numericCode));
				const identity = new FiscalAccessKeyBuilderService().build({
					emissionType: '1',
					invoiceNumber,
					issueDate: issuedAt,
					issuerCnpj: cnpj,
					model,
					numericCode,
					orderNumber: sale.orderNumber,
					serie,
					stateCode: '25',
				});
				const builder =
					model === '55' ? new BuildNfeXmlService() : new BuildNfceXmlService();
				let signedXml: string;
				try {
					const xml = builder.execute({
						identity,
						issuedAt,
						environment,
						sale: snapshot,
					});
					({ signedXml } = await this.signer.sign({ ...xml, issuerCnpj: cnpj }));
					await this.verifyXml(signedXml, 'nfe');
				} catch (error) {
					if (error instanceof FiscalXmlValidationError)
						throw new FiscalRequestError(422, error.message);
					throw new FiscalRequestError(
						503,
						'Não foi possível preparar a nota. Verifique o certificado, as URLs fiscais e o pacote de schemas.'
					);
				}
				return this.documents.queue(document.id, {
					accessKey: identity.accessKey,
					emissionType: '1',
					fiscalNumber: identity.fiscalNumber,
					model,
					serie,
					xmlContent: signedXml,
				});
			});
			return fiscalSummary(queued);
		} catch (error) {
			if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
				const winner = await this.documents.findForSale(orderId, environment);
				if (winner) return existingSummary(winner, expectedModel);
			}
			throw error;
		}
	}

	async get(orderId: string, id: string, format?: 'xml' | 'danfe') {
		const document = await this.documents.findById(orderId, id);
		if (!document) throw new FiscalRequestError(404, 'Documento fiscal não encontrado.');
		if (!format) return fiscalSummary(document);
		if (document.status !== 'AUTHORIZED' || !document.authorizedXml) {
			throw new FiscalRequestError(409, 'Documento ainda sem XML autorizado.');
		}
		if (
			createHash('sha256').update(document.authorizedXml).digest('hex') !==
			document.authorizedHash
		) {
			throw new FiscalRequestError(
				500,
				'A integridade do XML autorizado não pôde ser confirmada.'
			);
		}
		if (format === 'xml') return document.authorizedXml;
		if (document.type !== 'NFCE')
			throw new FiscalRequestError(422, 'Impressão térmica disponível para NFC-e.');
		return new GenerateDanfeNfceService().execute({ xml: document.authorizedXml });
	}

	async list(orderId: string) {
		return {
			productionEnabled: productionFiscalEnabled(),
			documents: (await this.documents.listForSale(orderId)).map(fiscalSummary),
		};
	}

	async reconcile(orderId: string, id: string) {
		const { count } = await this.documents.requestReconciliation(orderId, id);
		if (!count)
			throw new FiscalRequestError(
				409,
				'O documento não está aguardando uma consulta manual.'
			);
		return { id };
	}
}

function existingSummary(document: FiscalDocument, expectedModel?: '55' | '65') {
	if (expectedModel && document.model !== expectedModel)
		throw new FiscalRequestError(422, 'O pedido já possui documento fiscal de outro modelo.');
	return fiscalSummary(document);
}

function fiscalSummary(document: FiscalDocument) {
	const response = document.sefazResponse;
	const reason =
		response &&
		typeof response === 'object' &&
		'statusMessage' in response &&
		typeof response.statusMessage === 'string'
			? response.statusMessage
			: null;
	const message =
		document.status === 'AUTHORIZED'
			? 'Nota fiscal autorizada pela SEFAZ.'
			: document.status === 'REJECTED'
				? (reason ?? 'Nota fiscal rejeitada pela SEFAZ.')
				: document.status === 'AWAITING_SEFAZ'
					? (reason ?? 'Aguardando confirmação da SEFAZ.')
					: document.status === 'CANCELED'
						? 'Documento fiscal cancelado.'
						: 'Solicitação fiscal registrada.';
	return {
		id: document.id,
		orderId: document.orderId,
		accessKey: document.accessKey,
		model: document.model,
		environment: document.environment,
		protocol: document.protocol,
		status: document.status,
		message,
		authorizedAt: document.authorizedAt,
		requiresReview: document.status === 'AWAITING_SEFAZ' && document.nextAttemptAt === null,
	};
}

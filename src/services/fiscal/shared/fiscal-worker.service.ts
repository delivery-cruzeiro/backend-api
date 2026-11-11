import { createHash } from 'node:crypto';
import { PrismaFiscalDocumentRepository } from '../../../repositories/fiscal.repository.js';
import { productionFiscalEnabled } from './fiscal-emission.service.js';
import { SefazGatewayService, type SefazGateway } from './sefaz/sefaz-gateway.service.js';
import { NFE_NAMESPACE } from './xml/fiscal-xml.helpers.js';
import { validateFiscalXml } from './xml/validate-fiscal-xml.service.js';

export class FiscalWorker {
	constructor(
		private readonly repository = new PrismaFiscalDocumentRepository(),
		private readonly gateway: SefazGateway = new SefazGatewayService(),
		private readonly verifyXml = validateFiscalXml
	) {}

	async runOne() {
		const claim = await this.repository.claim(new Date(), productionFiscalEnabled());
		if (!claim) return false;
		const { document, leaseToken } = claim;
		if (document.status === 'PENDING' && document.order.status === 'CANCELLED') {
			await this.repository.finish(document.id, leaseToken, {
				status: 'REJECTED',
				nextAttemptAt: null,
				sefazResponse: {
					statusMessage: 'Pedido cancelado antes do envio. Revise a numeração reservada.',
				},
			});
			return true;
		}
		const {
			environment,
			issuerCnpj,
			accessKey,
			xmlContent: signedXml,
			type: documentType,
		} = document;
		if (
			!issuerCnpj ||
			!accessKey ||
			!signedXml ||
			(environment !== '1' && environment !== '2')
		) {
			await this.repository.finish(document.id, leaseToken, {
				status: 'REJECTED',
				nextAttemptAt: null,
				sefazResponse: {
					statusMessage: 'Registro fiscal incompleto. Revisão manual necessária.',
				},
			});
			return true;
		}
		const input = { issuerCnpj, accessKey, signedXml, environment, documentType } as const;
		const batchId = String(
			BigInt('0x' + createHash('sha256').update(document.id).digest('hex').slice(0, 12))
		);
		const result =
			document.status === 'PENDING'
				? await this.gateway.transmit({ ...input, batchId })
				: await this.gateway.reconcile(input, document.receipt);

		if (result.status === 'AUTHORIZED') {
			const xml = `<nfeProc xmlns="${NFE_NAMESPACE}" versao="4.00">${signedXml}${result.protocolXml}</nfeProc>`;
			try {
				await this.verifyXml(xml, 'procNFe');
			} catch {
				await this.repository.finish(document.id, leaseToken, {
					status: 'AWAITING_SEFAZ',
					nextAttemptAt: null,
					sefazResponse: {
						statusMessage:
							'A autorização foi localizada. Revise a validação do XML processado e consulte novamente.',
					},
				});
				return true;
			}
			await this.repository.finish(document.id, leaseToken, {
				status: 'AUTHORIZED',
				nextAttemptAt: null,
				protocol: result.protocol,
				authorizedXml: xml,
				authorizedHash: createHash('sha256').update(xml).digest('hex'),
				authorizedAt: result.authorizedAt,
				sefazResponse: { statusCode: result.statusCode },
			});
		} else {
			const waiting = result.status === 'AWAITING_SEFAZ';
			const canPoll =
				waiting && Date.now() - document.createdAt.getTime() < 24 * 60 * 60 * 1000;
			const delay = result.statusCode === '656' ? 60 * 60 * 1000 : 5 * 60 * 1000;
			await this.repository.finish(document.id, leaseToken, {
				status: result.status,
				nextAttemptAt: canPoll ? new Date(Date.now() + delay) : null,
				receipt:
					result.status === 'AWAITING_SEFAZ'
						? (result.receipt ?? document.receipt)
						: document.receipt,
				sefazResponse: {
					statusCode: result.statusCode ?? null,
					statusMessage:
						waiting && !canPoll
							? 'Autorização ainda não confirmada. Revise a chave e solicite uma nova consulta.'
							: result.statusMessage,
				},
			});
		}
		return true;
	}
}

export function startFiscalWorker(onError: (error: unknown) => void) {
	const worker = new FiscalWorker();
	let active: Promise<void> | undefined;
	const timer = setInterval(() => {
		if (active) return;
		active = worker
			.runOne()
			.then(() => undefined)
			.catch(onError)
			.finally(() => {
				active = undefined;
			});
	}, 3000);
	timer.unref();
	return async () => {
		clearInterval(timer);
		await active;
	};
}

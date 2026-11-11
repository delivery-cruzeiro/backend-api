import { request } from 'node:https';
import { DOMParser, XMLSerializer } from '@xmldom/xmldom';
import { CertificateService } from '../signing/certificate.service.js';
import type { SefazTransmitInput, SefazTransmitResult } from '../types/fiscal-emission.types.js';
import { NFE_NAMESPACE } from '../xml/fiscal-xml.helpers.js';
import { loadSefazTrustedRoots } from './sefaz-tls.service.js';

const SOAP = 'http://www.w3.org/2003/05/soap-envelope';
const XMLDSIG = 'http://www.w3.org/2000/09/xmldsig#';
const SERVICES = {
	authorize: ['NFeAutorizacao4', 'NfeAutorizacao/NFeAutorizacao4', 'nfeAutorizacaoLote', 'retEnviNFe'],
	receipt: ['NFeRetAutorizacao4', 'NfeRetAutorizacao/NFeRetAutorizacao4', 'nfeRetAutorizacaoLote', 'retConsReciNFe'],
	consult: ['NFeConsultaProtocolo4', 'NfeConsulta/NfeConsulta4', 'nfeConsultaNF', 'retConsSitNFe'],
} as const;

type Service = keyof typeof SERVICES;
type ParsedElement = NonNullable<
	ReturnType<ReturnType<ReturnType<DOMParser['parseFromString']>['getElementsByTagName']>['item']>
>;
type Transmission = Pick<
	SefazTransmitInput,
	'environment' | 'accessKey' | 'signedXml' | 'documentType' | 'issuerCnpj'
>;
type SendSoap = (url: URL, action: string, xml: string, issuer: string) => Promise<string>;

export interface SefazGateway {
	transmit(input: SefazTransmitInput): Promise<SefazTransmitResult>;
	reconcile(input: Transmission, receipt: string | null): Promise<SefazTransmitResult>;
}

export class SefazGatewayService implements SefazGateway {
	constructor(private readonly send: SendSoap = sendSoap) {}

	transmit(input: SefazTransmitInput) {
		const batch = `<enviNFe xmlns="${NFE_NAMESPACE}" versao="4.00"><idLote>${input.batchId}</idLote><indSinc>1</indSinc>${input.signedXml}</enviNFe>`;
		return this.exchange('authorize', input, batch);
	}

	async reconcile(input: Transmission, receipt: string | null) {
		if (receipt && /^\d{15}$/.test(receipt)) {
			const query = `<consReciNFe xmlns="${NFE_NAMESPACE}" versao="4.00"><tpAmb>${input.environment}</tpAmb><nRec>${receipt}</nRec></consReciNFe>`;
			const result = await this.exchange('receipt', input, query);
			if (result.status !== 'AWAITING_SEFAZ' || result.statusCode === '105') return result;
		}
		const query = `<consSitNFe xmlns="${NFE_NAMESPACE}" versao="4.00"><tpAmb>${input.environment}</tpAmb><xServ>CONSULTAR</xServ><chNFe>${input.accessKey}</chNFe></consSitNFe>`;
		return this.exchange('consult', input, query);
	}

	private async exchange(
		service: Service,
		input: Transmission,
		payload: string
	): Promise<SefazTransmitResult> {
		const [name, path, operation, responseTag] = SERVICES[service];
		const kind = input.documentType === 'NFE' ? 'nfe' : 'nfce';
		const host = input.environment === '1' ? kind : `${kind}-homologacao`;
		const endpoint = new URL(`https://${host}.svrs.rs.gov.br/ws/${path}.asmx`);
		const namespace = `${NFE_NAMESPACE}/wsdl/${name}`;
		const xml = `<?xml version="1.0" encoding="UTF-8"?><soap12:Envelope xmlns:soap12="${SOAP}"><soap12:Body><nfeDadosMsg xmlns="${namespace}">${payload}</nfeDadosMsg></soap12:Body></soap12:Envelope>`;
		try {
			const body = await this.send(
				endpoint,
				`${namespace}/${operation}`,
				xml,
				input.issuerCnpj
			);
			return interpret(body, input, responseTag, service);
		} catch {
			return awaiting(
				'Comunicação ou resposta da SEFAZ não confirmada. A consulta usará a mesma chave.'
			);
		}
	}
}

function interpret(
	xml: string,
	input: Transmission,
	responseTag: string,
	service: Service
): SefazTransmitResult {
	if (/<!DOCTYPE/i.test(xml)) throw new Error('Resposta fiscal inválida');
	const parser = new DOMParser();
	const response = parser.parseFromString(xml, 'text/xml');
	const body = response.getElementsByTagNameNS(SOAP, 'Body').item(0);
	const result = body?.getElementsByTagNameNS(NFE_NAMESPACE, responseTag).item(0);
	if (!result || text(result, 'tpAmb') !== input.environment)
		return awaiting('Ambiente ou formato do retorno não confirmado.');
	const batchStatus = text(result, 'cStat');
	const reason = text(result, 'xMotivo');
	if (batchStatus === '103') {
		const receipt = text(child(result, 'infRec'), 'nRec');
		return {
			...awaiting(reason, batchStatus),
			...(/^\d{15}$/.test(receipt) ? { receipt } : {}),
		};
	}
	const documentResult =
		service === 'consult'
			? batchStatus === '100' || batchStatus === '150'
			: batchStatus === '104';
	const protocol = documentResult ? child(result, 'protNFe') : null;
	const info = child(protocol, 'infProt');
	if (info) {
		const code = text(info, 'cStat');
		if (text(info, 'chNFe') !== input.accessKey || text(info, 'tpAmb') !== input.environment) {
			return awaiting('Retorno de documento com chave ou ambiente divergente.');
		}
		if (code === '100' || code === '150') {
			const number = text(info, 'nProt');
			const date = new Date(text(info, 'dhRecbto'));
			const sent = parser.parseFromString(input.signedXml, 'text/xml');
			const digest = sent.getElementsByTagNameNS(XMLDSIG, 'DigestValue').item(0)?.textContent;
			if (
				!/^\d{15,17}$/.test(number) ||
				Number.isNaN(date.valueOf()) ||
				!digest ||
				text(info, 'digVal') !== digest
			) {
				return awaiting('Protocolo, data ou digest da autorização não conferem.', code);
			}
			protocol!.setAttribute('xmlns', NFE_NAMESPACE);
			return {
				status: 'AUTHORIZED',
				protocol: number,
				authorizedAt: date,
				protocolXml: new XMLSerializer().serializeToString(protocol!),
				statusCode: code,
			};
		}
		if (
			/^\d{3}$/.test(code) &&
			!['204', '539', '217', '999'].includes(code) &&
			service !== 'consult'
		) {
			return { status: 'REJECTED', statusCode: code, statusMessage: text(info, 'xMotivo') };
		}
	}
	// Service failures and duplicate keys require reconciliation. A confirmed
	// authorization always comes from the matching document protocol above.
	if (service === 'authorize' && ['215', '225', '452', '776'].includes(batchStatus)) {
		return { status: 'REJECTED', statusCode: batchStatus, statusMessage: reason };
	}
	return awaiting(reason || 'Retorno fiscal pendente de confirmação.', batchStatus);
}

function child(parent: ParsedElement | null, tag: string): ParsedElement | null {
	return (
		(Array.from(parent?.childNodes ?? []).find(
			node =>
				'localName' in node && node.localName === tag && node.namespaceURI === NFE_NAMESPACE
		) as ParsedElement | undefined) ?? null
	);
}

function text(parent: ParsedElement | null, tag: string) {
	return child(parent, tag)?.textContent?.trim() ?? '';
}

function awaiting(statusMessage: string, statusCode?: string) {
	return { status: 'AWAITING_SEFAZ' as const, statusMessage, statusCode };
}

async function sendSoap(endpoint: URL, action: string, xml: string, issuer: string) {
	const credential = await new CertificateService().loadForIssuer(issuer);
	const ca = await loadSefazTrustedRoots();
	return new Promise<string>((resolve, reject) => {
		const connection = request(
			endpoint,
			{
				method: 'POST',
				ca,
				cert: credential.transportCertificatePem,
				key: credential.privateKeyPem,
				agent: false,
				signal: AbortSignal.timeout(15_000),
				headers: {
					'Content-Type': `application/soap+xml; charset=utf-8; action="${action}"`,
					'Content-Length': Buffer.byteLength(xml),
				},
			},
			response => {
				let length = 0;
				const parts: Buffer[] = [];
				response.on('data', (part: Buffer) => {
					length += part.length;
					if (length > 2_000_000) {
						connection.destroy(new Error('Resposta SEFAZ acima do limite'));
						return;
					}
					parts.push(part);
				});
				response.on('error', reject);
				response.on('end', () => {
					if (response.statusCode !== 200)
						return reject(new Error('Resposta HTTP do autorizador inválida'));
					resolve(Buffer.concat(parts).toString('utf8'));
				});
			}
		);
		connection.on('error', reject);
		connection.end(xml);
	});
}

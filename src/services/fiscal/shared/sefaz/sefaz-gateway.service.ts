import type { SefazTransmitInput, SefazTransmitResult } from '../types/fiscal-emission.types.js';

export interface SefazGateway {
	transmit(input: SefazTransmitInput): Promise<SefazTransmitResult>;
}

export class SefazGatewayService implements SefazGateway {
	async transmit(input: SefazTransmitInput): Promise<SefazTransmitResult> {
		const endpoint = this.resolveEndpoint(input);

		if (!endpoint) {
			return {
				connectionError: true,
				rawResponse: 'SEFAZ endpoint nao configurado',
				status: 'REJECTED',
				statusMessage: 'Endpoint da SEFAZ nao configurado',
			};
		}

		try {
			const response = await fetch(endpoint, {
				body: buildSoapEnvelope(input.signedXml),
				headers: {
					'content-type': 'application/soap+xml; charset=utf-8',
				},
				method: 'POST',
			});
			const rawResponse = await response.text();
			const parsed = parseSefazResponse(rawResponse);

			if (!response.ok) {
				return {
					rawResponse,
					status: 'REJECTED',
					statusCode: String(response.status),
					statusMessage: parsed.statusMessage ?? response.statusText,
				};
			}

			return {
				protocol: parsed.protocol,
				rawResponse,
				status: parsed.authorized ? 'AUTHORIZED' : 'REJECTED',
				statusCode: parsed.statusCode,
				statusMessage: parsed.statusMessage,
			};
		} catch (error) {
			return {
				connectionError: true,
				rawResponse: error instanceof Error ? error.message : 'Erro de conexao com a SEFAZ',
				status: 'REJECTED',
				statusMessage: 'Erro de conexao com a SEFAZ',
			};
		}
	}

	private resolveEndpoint(input: SefazTransmitInput) {
		if (input.test) {
			if (input.documentType === 'NFE') {
				return process.env.SEFAZ_NFE_AUTHORIZATION_URL_HOMOLOG ?? process.env.SEFAZ_AUTHORIZATION_URL_HOMOLOG;
			}

			return process.env.SEFAZ_NFCE_AUTHORIZATION_URL_HOMOLOG ?? process.env.SEFAZ_AUTHORIZATION_URL_HOMOLOG;
		}

		if (input.documentType === 'NFE') {
			return process.env.SEFAZ_NFE_AUTHORIZATION_URL ?? process.env.SEFAZ_AUTHORIZATION_URL;
		}

		return process.env.SEFAZ_NFCE_AUTHORIZATION_URL ?? process.env.SEFAZ_AUTHORIZATION_URL;
	}
}

function buildSoapEnvelope(signedXml: string) {
	return `<?xml version="1.0" encoding="UTF-8"?><soap12:Envelope xmlns:soap12="http://www.w3.org/2003/05/soap-envelope"><soap12:Body><nfeDadosMsg xmlns="http://www.portalfiscal.inf.br/nfe/wsdl/NFeAutorizacao4">${signedXml}</nfeDadosMsg></soap12:Body></soap12:Envelope>`;
}

function parseSefazResponse(rawResponse: string) {
	const statusCode = getFirstMatch(rawResponse, /<cStat>([^<]+)<\/cStat>/);
	const statusMessage = getFirstMatch(rawResponse, /<xMotivo>([^<]+)<\/xMotivo>/);
	const protocol = getFirstMatch(rawResponse, /<nProt>([^<]+)<\/nProt>/);

	return {
		authorized: statusCode === '100' || statusCode === '150',
		protocol,
		statusCode,
		statusMessage,
	};
}

function getFirstMatch(value: string, regex: RegExp) {
	return regex.exec(value)?.[1];
}

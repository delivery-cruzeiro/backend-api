import { create } from 'xmlbuilder2';
import type { FiscalAddress, FiscalXmlBuildInput } from '../types/fiscal-emission.types.js';

export const NFE_NAMESPACE = 'http://www.portalfiscal.inf.br/nfe';
const HOMOLOGATION_RECIPIENT = 'NF-E EMITIDA EM AMBIENTE DE HOMOLOGACAO - SEM VALOR FISCAL';
const HOMOLOGATION_PRODUCT = 'NOTA FISCAL EMITIDA EM AMBIENTE DE HOMOLOGACAO - SEM VALOR FISCAL';

export function toFiscalDateTime(date: Date) {
	// The current fiscal rollout is restricted to Paraíba (UTC−03).
	const local = new Date(date.getTime() - 3 * 60 * 60 * 1000);
	return local.toISOString().slice(0, 19) + '-03:00';
}

function amount(cents: number) {
	return (cents / 100).toFixed(2);
}

function addressXml(data: FiscalAddress) {
	return {
		xLgr: data.street,
		nro: data.number,
		...(data.complement ? { xCpl: data.complement } : {}),
		xBairro: data.neighborhood,
		cMun: data.cityCode,
		xMun: data.city,
		UF: data.state,
		CEP: data.zipCode,
		cPais: '1058',
		xPais: 'BRASIL',
	};
}

export function buildSaleXml(
	input: FiscalXmlBuildInput,
	model: {
		print: 1 | 4;
		presence: 1 | 2 | 4;
		supplement?: { qrCode: string; urlChave: string };
	}
) {
	const { identity, sale, issuedAt, environment } = input;
	const { issuer, recipient } = sale;
	const homologation = environment === '2';
	const destination = recipient && {
		[recipient.id.length === 11 ? 'CPF' : 'CNPJ']: recipient.id,
		xNome: homologation ? HOMOLOGATION_RECIPIENT : recipient.name,
		...(recipient.address ? { enderDest: addressXml(recipient.address) } : {}),
		indIEDest: recipient.taxIndicator,
		...(recipient.ie ? { IE: recipient.ie } : {}),
	};
	const products = sale.items.reduce((total, line) => total + line.price * line.quantity, 0);
	const freight = sale.items.reduce((total, line) => total + line.freight, 0);
	const discount = sale.items.reduce((total, line) => total + line.discount, 0);
	const xml = create({
		NFe: {
			'@xmlns': NFE_NAMESPACE,
			infNFe: {
				'@Id': identity.fiscalId,
				'@versao': '4.00',
				ide: {
					cUF: issuer.address.cityCode.slice(0, 2),
					cNF: identity.numericCode,
					natOp: 'Venda',
					mod: identity.model,
					serie: Number(identity.serie),
					nNF: Number(identity.fiscalNumber),
					dhEmi: toFiscalDateTime(issuedAt),
					tpNF: 1,
					idDest: 1,
					cMunFG: issuer.address.cityCode,
					tpImp: model.print,
					tpEmis: identity.emissionType,
					cDV: identity.checkDigit,
					tpAmb: environment,
					finNFe: 1,
					indFinal: sale.finalConsumer ? 1 : 0,
					indPres: model.presence,
					...(model.presence === 1 ? {} : { indIntermed: 0 }),
					procEmi: 0,
					verProc: 'cruzeiro-1',
				},
				emit: {
					CNPJ: issuer.cnpj,
					xNome: issuer.name,
					xFant: issuer.tradeName,
					enderEmit: addressXml(issuer.address),
					IE: issuer.ie,
					CRT: issuer.crt,
				},
				...(destination ? { dest: destination } : {}),
				det: sale.items.map((line, index) => ({
					'@nItem': index + 1,
					prod: {
						cProd: line.code,
						cEAN: line.gtin,
						xProd:
							homologation && identity.model === '65' && index === 0
								? HOMOLOGATION_PRODUCT
								: line.name,
						NCM: line.ncm,
						CFOP: line.cfop,
						uCom: line.unit,
						qCom: line.quantity.toFixed(4),
						vUnCom: amount(line.price),
						vProd: amount(line.price * line.quantity),
						cEANTrib: line.gtin,
						uTrib: line.unit,
						qTrib: line.quantity.toFixed(4),
						vUnTrib: amount(line.price),
						...(line.freight ? { vFrete: amount(line.freight) } : {}),
						...(line.discount ? { vDesc: amount(line.discount) } : {}),
						indTot: 1,
					},
					imposto: {
						ICMS:
							line.csosn === '500'
								? { ICMSSN500: { orig: line.origin, CSOSN: line.csosn } }
								: { ICMSSN102: { orig: line.origin, CSOSN: line.csosn } },
						PIS: {
							PISOutr: { CST: line.pisCst, vBC: '0.00', pPIS: '0.00', vPIS: '0.00' },
						},
						COFINS: {
							COFINSOutr: {
								CST: line.cofinsCst,
								vBC: '0.00',
								pCOFINS: '0.00',
								vCOFINS: '0.00',
							},
						},
					},
				})),
				total: {
					ICMSTot: {
						vBC: '0.00',
						vICMS: '0.00',
						vICMSDeson: '0.00',
						vFCP: '0.00',
						vBCST: '0.00',
						vST: '0.00',
						vFCPST: '0.00',
						vFCPSTRet: '0.00',
						vProd: amount(products),
						vFrete: amount(freight),
						vSeg: '0.00',
						vDesc: amount(discount),
						vII: '0.00',
						vIPI: '0.00',
						vIPIDevol: '0.00',
						vPIS: '0.00',
						vCOFINS: '0.00',
						vOutro: '0.00',
						vNF: amount(sale.total),
					},
				},
				transp: { modFrete: sale.delivery && identity.model === '55' ? 3 : 9 },
				pag: { detPag: { tPag: sale.payment, vPag: amount(sale.total) } },
				infAdic: { infCpl: `Pedido interno ${sale.orderNumber}` },
			},
			...(model.supplement ? { infNFeSupl: model.supplement } : {}),
		},
	}).end({ headless: true });
	return { referenceId: identity.fiscalId, xml };
}

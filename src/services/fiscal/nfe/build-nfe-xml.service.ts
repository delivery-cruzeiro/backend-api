import { create } from 'xmlbuilder2';
import type {
	FiscalXmlBuildInput,
	FiscalXmlBuildResult,
} from '../shared/types/fiscal-emission.types.js';
import {
	calculateItemsTotal,
	formatDecimal,
	formatQuantity,
	onlyDigits,
	toFiscalDateTime,
} from '../shared/xml/fiscal-xml.helpers.js';

export class BuildNfeXmlService {
	execute(input: FiscalXmlBuildInput): FiscalXmlBuildResult {
		const { identity, issuer, sale } = input;
		const productsTotal = calculateItemsTotal(sale);

		const document = create({
			NFe: {
				'@xmlns': 'http://www.portalfiscal.inf.br/nfe',
				infNFe: {
					'@Id': identity.fiscalId,
					'@versao': '4.00',
					ide: {
						cUF: issuer.stateCode,
						cNF: identity.numericCode,
						natOp: 'Venda',
						mod: identity.model,
						serie: Number(identity.serie),
						nNF: Number(identity.fiscalNumber),
						dhEmi: toFiscalDateTime(new Date()),
						tpNF: 1,
						idDest: 1,
						cMunFG: issuer.cityCode,
						tpImp: 1,
						tpEmis: identity.emissionType,
						cDV: identity.checkDigit,
						tpAmb: input.test ? 2 : Number(process.env.SEFAZ_ENVIRONMENT ?? 2),
						finNFe: 1,
						indFinal: 1,
						indPres: 1,
						procEmi: 0,
						verProc: 'delivery-cruzeiro-1.0',
					},
					emit: {
						CNPJ: onlyDigits(issuer.cnpj),
						xNome: issuer.name,
						xFant: issuer.tradeName,
						enderEmit: {
							xLgr: issuer.address.street,
							nro: issuer.address.number,
							...(issuer.address.complement
								? { xCpl: issuer.address.complement }
								: {}),
							xBairro: issuer.address.neighborhood,
							cMun: issuer.cityCode,
							xMun: issuer.address.city,
							UF: issuer.address.state,
							CEP: onlyDigits(issuer.address.zipCode),
							cPais: '1058',
							xPais: 'BRASIL',
							...(onlyDigits(issuer.phoneNumber)
								? { fone: onlyDigits(issuer.phoneNumber) }
								: {}),
						},
					},
					dest: {
						xNome: sale.user?.name ?? 'Consumidor final',
						...(sale.user?.email ? { email: sale.user.email } : {}),
					},
					det: sale.items.map((item, index) => ({
						'@nItem': index + 1,
						prod: {
							cProd: item.productId,
							cEAN: 'SEM GTIN',
							xProd: item.product?.name ?? `Produto ${item.productId}`,
							NCM: process.env.FISCAL_DEFAULT_NCM ?? '00000000',
							CFOP: process.env.FISCAL_DEFAULT_CFOP ?? '5102',
							uCom: process.env.FISCAL_DEFAULT_UNIT ?? 'UN',
							qCom: formatQuantity(item.quantity),
							vUnCom: formatDecimal(item.price),
							vProd: formatDecimal(Number(item.price) * item.quantity),
							cEANTrib: 'SEM GTIN',
							uTrib: process.env.FISCAL_DEFAULT_UNIT ?? 'UN',
							qTrib: formatQuantity(item.quantity),
							vUnTrib: formatDecimal(item.price),
							indTot: 1,
						},
						imposto: {
							ICMS: {
								ICMSSN102: {
									orig: 0,
									CSOSN: process.env.FISCAL_DEFAULT_CSOSN ?? '102',
								},
							},
							PIS: {
								PISOutr: {
									CST: process.env.FISCAL_DEFAULT_PIS_CST ?? '99',
									vBC: '0.00',
									pPIS: '0.00',
									vPIS: '0.00',
								},
							},
							COFINS: {
								COFINSOutr: {
									CST: process.env.FISCAL_DEFAULT_COFINS_CST ?? '99',
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
							vFCPUFDest: '0.00',
							vICMSUFDest: '0.00',
							vICMSUFRemet: '0.00',
							vFCP: '0.00',
							vBCST: '0.00',
							vST: '0.00',
							vFCPST: '0.00',
							vFCPSTRet: '0.00',
							vProd: formatDecimal(productsTotal),
							vFrete: formatDecimal(sale.deliveryFee),
							vSeg: '0.00',
							vDesc: formatDecimal(sale.discount),
							vII: '0.00',
							vIPI: '0.00',
							vIPIDevol: '0.00',
							vPIS: '0.00',
							vCOFINS: '0.00',
							vOutro: '0.00',
							vNF: formatDecimal(sale.total),
						},
					},
					transp: {
						modFrete: 9,
					},
					pag: {
						detPag: {
							tPag: '01',
							vPag: formatDecimal(sale.total),
						},
					},
					infAdic: {
						infCpl: sale.notes ?? `Pedido interno ${sale.orderNumber}`,
					},
				},
			},
		});

		return {
			referenceId: identity.fiscalId,
			xml: document.end({ headless: true }),
		};
	}
}

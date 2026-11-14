import { DOMParser } from '@xmldom/xmldom';
import type { DanfeNfceData } from './danfe-nfce.types.js';

type XmlDocument = ReturnType<InstanceType<typeof DOMParser>['parseFromString']>;
type XmlElement = NonNullable<ReturnType<ReturnType<XmlDocument['getElementsByTagName']>['item']>>;
type XmlParent = XmlDocument | XmlElement;

interface ParseDanfeNfceInput {
	authorizationDate?: string | null;
	protocol?: string | null;
	xml: string;
}

export class DanfeNfceXmlParserService {
	execute(input: ParseDanfeNfceInput): DanfeNfceData {
		const document = new DOMParser().parseFromString(input.xml, 'text/xml');
		const infNFe = firstElement(document, 'infNFe');

		if (!infNFe) {
			throw new Error('XML NFC-e nao possui infNFe para gerar DANFE.');
		}

		const accessKey = infNFe.getAttribute('Id')?.replace(/^NFe/, '') ?? '';
		const environment = text(infNFe, 'tpAmb') || '2';
		const qrCodeUrl = text(document, 'qrCode');
		if (!qrCodeUrl) throw new Error('O XML da NFC-e não contém o QR Code.');
		const protocol = input.protocol ?? text(document, 'nProt') ?? null;
		const authorizationDate = input.authorizationDate ?? text(document, 'dhRecbto') ?? null;
		const dest = firstElement(infNFe, 'dest');
		const totals = firstElement(infNFe, 'ICMSTot');
		const emit = firstElement(infNFe, 'emit');
		if (!emit) throw new Error('XML NFC-e não possui emitente.');

		return {
			...(dest
				? {
						recipient: {
							name: text(dest, 'xNome'),
							id:
								text(dest, 'CPF') ||
								text(dest, 'CNPJ') ||
								text(dest, 'idEstrangeiro'),
							idType: text(dest, 'CPF')
								? 'CPF'
								: text(dest, 'CNPJ')
									? 'CNPJ'
									: 'Id. Estrangeiro',
							address: ['xLgr', 'nro', 'xBairro', 'xMun', 'UF', 'CEP']
								.map(key => text(dest, key))
								.filter(Boolean)
								.join(', '),
						},
					}
				: {}),
			discount: totals ? text(totals, 'vDesc') : '',
			freight: totals ? text(totals, 'vFrete') : '',
			insurance: totals ? text(totals, 'vSeg') : '',
			otherCharges: totals ? text(totals, 'vOutro') : '',
			estimatedTaxes: totals ? text(totals, 'vTotTrib') : '',
			change: text(infNFe, 'vTroco'),
			additionalInfo: [text(infNFe, 'infAdFisco'), text(infNFe, 'infCpl')]
				.filter(Boolean)
				.join('\n'),
			consultationUrl: text(document, 'urlChave'),
			accessKey,
			authorizationDate,
			contingency: text(infNFe, 'tpEmis') === '9',
			emit: {
				city: text(emit, 'xMun'),
				cnpj: text(emit, 'CNPJ'),
				ie: text(emit, 'IE') || null,
				name: text(emit, 'xNome'),
				neighborhood: text(emit, 'xBairro'),
				number: text(emit, 'nro'),
				state: text(emit, 'UF'),
				street: text(emit, 'xLgr'),
				tradeName: text(emit, 'xFant') || null,
				zipCode: text(emit, 'CEP'),
			},
			environment,
			fiscalNumber: text(infNFe, 'nNF'),
			issuedAt: text(infNFe, 'dhEmi'),
			model: text(infNFe, 'mod'),
			payments: elements(infNFe, 'detPag').map(payment => ({
				amount: text(payment, 'vPag'),
				type: paymentTypeLabel(text(payment, 'tPag')),
			})),
			products: elements(infNFe, 'det').map(item => ({
				code: text(item, 'cProd'),
				unit: text(item, 'uCom'),
				name: text(item, 'xProd'),
				quantity: text(item, 'qCom'),
				total: text(item, 'vProd'),
				unitValue: text(item, 'vUnCom'),
			})),
			protocol,
			qrCodeUrl,
			serie: text(infNFe, 'serie'),
			total: text(infNFe, 'vNF'),
		};
	}
}

function firstElement(parent: XmlParent, tagName: string) {
	return parent.getElementsByTagName(tagName).item(0);
}

function elements(parent: XmlParent, tagName: string) {
	return Array.from(parent.getElementsByTagName(tagName));
}

function text(parent: XmlParent, tagName: string) {
	return firstElement(parent, tagName)?.textContent?.trim() ?? '';
}

function paymentTypeLabel(code: string) {
	const labels: Record<string, string> = {
		'01': 'Dinheiro',
		'02': 'Cheque',
		'03': 'Cartao de credito',
		'04': 'Cartao de debito',
		'17': 'Pix',
		'20': 'Pix estático',
		'90': 'Sem pagamento',
	};

	return labels[code] ?? code;
}

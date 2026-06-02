import { DOMParser } from '@xmldom/xmldom';
import type { DanfeNfceData } from './danfe-nfce.types.js';
import { BuildNfceQrCodeUrlService } from './build-nfce-qrcode-url.service.js';

type XmlDocument = ReturnType<InstanceType<typeof DOMParser>['parseFromString']>;
type XmlElement = NonNullable<ReturnType<ReturnType<XmlDocument['getElementsByTagName']>['item']>>;
type XmlParent = XmlDocument | XmlElement;

interface ParseDanfeNfceInput {
	authorizationDate?: string | null;
	protocol?: string | null;
	xml: string;
}

export class DanfeNfceXmlParserService {
	constructor(private readonly qrCodeUrlBuilder = new BuildNfceQrCodeUrlService()) {}

	execute(input: ParseDanfeNfceInput): DanfeNfceData {
		const document = new DOMParser().parseFromString(input.xml, 'text/xml');
		const infNFe = firstElement(document, 'infNFe');

		if (!infNFe) {
			throw new Error('XML NFC-e nao possui infNFe para gerar DANFE.');
		}

		const accessKey = infNFe.getAttribute('Id')?.replace(/^NFe/, '') ?? '';
		const environment = text(infNFe, 'tpAmb') || '2';
		const qrCodeUrl = this.qrCodeUrlBuilder.execute({ accessKey, environment });
		const protocol = input.protocol ?? text(document, 'nProt') ?? null;
		const authorizationDate = input.authorizationDate ?? text(document, 'dhRecbto') ?? null;

		return {
			accessKey,
			authorizationDate,
			contingency: text(infNFe, 'tpEmis') === '9',
			emit: {
				city: text(infNFe, 'xMun'),
				cnpj: text(infNFe, 'CNPJ'),
				ie: text(infNFe, 'IE') || null,
				name: text(infNFe, 'xNome'),
				neighborhood: text(infNFe, 'xBairro'),
				number: text(infNFe, 'nro'),
				state: text(infNFe, 'UF'),
				street: text(infNFe, 'xLgr'),
				tradeName: text(infNFe, 'xFant') || null,
				zipCode: text(infNFe, 'CEP'),
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
		'90': 'Sem pagamento',
	};

	return labels[code] ?? code;
}

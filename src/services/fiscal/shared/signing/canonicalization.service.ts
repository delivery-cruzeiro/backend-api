import { DOMParser } from '@xmldom/xmldom';
import { C14nCanonicalization } from 'xml-crypto';

export const XML_CANONICALIZATION_ALGORITHMS = {
	C14N_1_0: 'http://www.w3.org/TR/2001/REC-xml-c14n-20010315',
} as const;

export interface CanonicalizeXmlInput {
	referenceId?: string;
	xml: string;
}

export class CanonicalizationService {
	private readonly canonicalizer = new C14nCanonicalization();

	canonicalize(input: CanonicalizeXmlInput) {
		const document = parseXml(input.xml);
		const node = input.referenceId
			? findElementById(document, input.referenceId)
			: document.documentElement;

		if (!node) {
			throw new Error(
				'No XML informado nao foi encontrado o no referenciado para assinatura'
			);
		}

		return this.canonicalizer.process(node as unknown as Node, {});
	}
}

export function parseXml(xml: string) {
	return new DOMParser({
		onError: level => {
			if (level === 'error' || level === 'fatalError') {
				throw new Error('XML fiscal invalido para assinatura');
			}
		},
	}).parseFromString(xml, 'application/xml');
}

export function findElementById(
	document: ReturnType<DOMParser['parseFromString']>,
	referenceId: string
) {
	const elements = Array.from(document.getElementsByTagName('*'));

	return elements.find(element => element.getAttribute('Id') === referenceId) ?? null;
}

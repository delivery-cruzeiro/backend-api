import { SignedXml } from 'xml-crypto';
import { CertificateService, type LoadDigitalCertificateInput } from './certificate.service.js';
import {
	XML_CANONICALIZATION_ALGORITHMS,
	findElementById,
	parseXml,
} from './canonicalization.service.js';
import { XML_DIGEST_ALGORITHMS } from './digest.service.js';

export const XML_SIGNATURE_ALGORITHMS = {
	RSA_SHA1: 'http://www.w3.org/2000/09/xmldsig#rsa-sha1',
	RSA_SHA256: 'http://www.w3.org/2001/04/xmldsig-more#rsa-sha256',
} as const;

const ENVELOPED_SIGNATURE_TRANSFORM = 'http://www.w3.org/2000/09/xmldsig#enveloped-signature';
const XMLDSIG_NAMESPACE = 'http://www.w3.org/2000/09/xmldsig#';
const SEFAZ_FISCAL_ID_PATTERN = /^NFe\d{44}$/;

export interface SignXmlInput extends LoadDigitalCertificateInput {
	referenceId: string;
	xml: string;
}

export interface SignedFiscalXml {
	certificateBase64: string;
	referenceUri: string;
	signatureXml: string;
	signedXml: string;
}

export class SignXmlService {
	constructor(private readonly certificateService = new CertificateService()) {}

	async sign(input: SignXmlInput): Promise<SignedFiscalXml> {
		this.validateInputXml(input.xml, input.referenceId);

		const certificate = await this.certificateService.load({
			certificateBuffer: input.certificateBuffer,
			certificatePassword: input.certificatePassword,
			certificatePath: input.certificatePath,
		});

		const signature = new SignedXml({
			canonicalizationAlgorithm: XML_CANONICALIZATION_ALGORITHMS.C14N_1_0,
			getKeyInfoContent: SignedXml.getKeyInfoContent,
			privateKey: certificate.privateKeyPem,
			publicCert: certificate.certificatePem,
			signatureAlgorithm: XML_SIGNATURE_ALGORITHMS.RSA_SHA1,
		});

		signature.addReference({
			digestAlgorithm: XML_DIGEST_ALGORITHMS.SHA1,
			transforms: [ENVELOPED_SIGNATURE_TRANSFORM, XML_CANONICALIZATION_ALGORITHMS.C14N_1_0],
			uri: `#${input.referenceId}`,
			xpath: buildIdXPath(input.referenceId),
		});

		signature.computeSignature(input.xml, {
			location: {
				action: 'append',
				reference: '/*',
			},
		});

		const signedXml = signature.getSignedXml();

		this.validateSignedXml(signedXml);

		return {
			certificateBase64: certificate.certificateBase64,
			referenceUri: `#${input.referenceId}`,
			signatureXml: signature.getSignatureXml(),
			signedXml,
		};
	}

	private validateInputXml(xml: string, referenceId: string) {
		if (!SEFAZ_FISCAL_ID_PATTERN.test(referenceId)) {
			throw new Error('Id fiscal deve seguir o formato NFe + 44 digitos');
		}

		const document = parseXml(xml);

		if (!findElementById(document, referenceId)) {
			throw new Error('No infNFe com Id fiscal informado nao encontrado no XML');
		}

		const existingSignatures = document.getElementsByTagNameNS(XMLDSIG_NAMESPACE, 'Signature');

		if (existingSignatures.length > 0) {
			throw new Error('XML fiscal ja possui assinatura digital');
		}
	}

	private validateSignedXml(signedXml: string) {
		const document = parseXml(signedXml);
		const signatures = document.getElementsByTagNameNS(XMLDSIG_NAMESPACE, 'Signature');

		if (signatures.length !== 1) {
			throw new Error('XML assinado deve possuir exatamente uma assinatura digital');
		}
	}
}

function buildIdXPath(referenceId: string) {
	return `//*[@Id=${toXPathStringLiteral(referenceId)}]`;
}

function toXPathStringLiteral(value: string) {
	if (!value.includes("'")) {
		return `'${value}'`;
	}

	if (!value.includes('"')) {
		return `"${value}"`;
	}

	const singleQuoteLiteral = `"'"`;

	return `concat(${value
		.split("'")
		.map(part => `'${part}'`)
		.join(`, ${singleQuoteLiteral}, `)})`;
}

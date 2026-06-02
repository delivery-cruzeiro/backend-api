import { DOMParser } from '@xmldom/xmldom';
import forge from 'node-forge';
import { describe, expect, it } from 'vitest';
import { SignedXml } from 'xml-crypto';
import { CertificateService } from '../../src/services/fiscal/shared/signing/certificate.service.js';
import { CanonicalizationService } from '../../src/services/fiscal/shared/signing/canonicalization.service.js';
import { DigestService } from '../../src/services/fiscal/shared/signing/digest.service.js';
import { SignXmlService } from '../../src/services/fiscal/shared/signing/sign-xml.service.js';

const CERTIFICATE_PASSWORD = 'senha-teste';
const FISCAL_ID = 'NFe25260512345678000199650090000000011000182730';

function createTestCertificateBuffer() {
	const keys = forge.pki.rsa.generateKeyPair(1024);
	const certificate = forge.pki.createCertificate();

	certificate.publicKey = keys.publicKey;
	certificate.serialNumber = '01';
	certificate.validity.notBefore = new Date('2026-01-01T00:00:00.000Z');
	certificate.validity.notAfter = new Date('2027-01-01T00:00:00.000Z');
	certificate.setSubject([{ name: 'commonName', value: 'Delivery Cruzeiro Teste' }]);
	certificate.setIssuer([{ name: 'commonName', value: 'Delivery Cruzeiro Teste' }]);
	certificate.sign(keys.privateKey, forge.md.sha256.create());

	const p12Asn1 = forge.pkcs12.toPkcs12Asn1(
		keys.privateKey,
		[certificate],
		CERTIFICATE_PASSWORD,
		{
			algorithm: '3des',
		}
	);
	const p12Der = forge.asn1.toDer(p12Asn1).getBytes();

	return Buffer.from(p12Der, 'binary');
}

function createFiscalXml() {
	return `<NFe xmlns="http://www.portalfiscal.inf.br/nfe"><infNFe Id="${FISCAL_ID}" versao="4.00"><ide><cUF>25</cUF></ide></infNFe></NFe>`;
}

describe('CertificateService', () => {
	it('carrega certificado A1 em memoria e extrai chave privada e certificado publico', async () => {
		const service = new CertificateService();

		const certificate = await service.load({
			certificateBuffer: createTestCertificateBuffer(),
			certificatePassword: CERTIFICATE_PASSWORD,
		});

		expect(certificate.privateKeyPem).toContain('BEGIN RSA PRIVATE KEY');
		expect(certificate.certificatePem).toContain('BEGIN CERTIFICATE');
		expect(certificate.certificateBase64).not.toContain('BEGIN CERTIFICATE');
		expect(certificate.source).toBe('buffer');
	});
});

describe('DigestService', () => {
	it('gera digest base64 a partir do XML canonicalizado', () => {
		const canonicalizationService = new CanonicalizationService();
		const digestService = new DigestService(canonicalizationService);

		const canonicalXml = canonicalizationService.canonicalize({
			referenceId: FISCAL_ID,
			xml: createFiscalXml(),
		});
		const digest = digestService.calculate({
			referenceId: FISCAL_ID,
			xml: createFiscalXml(),
		});

		expect(canonicalXml).toContain(`Id="${FISCAL_ID}"`);
		expect(digest).toMatch(/^[A-Za-z0-9+/]+=*$/);
	});
});

describe('SignXmlService', () => {
	it('assina o XML fiscal com XMLDSig enveloped e certificado X509', async () => {
		const service = new SignXmlService();

		const result = await service.sign({
			certificateBuffer: createTestCertificateBuffer(),
			certificatePassword: CERTIFICATE_PASSWORD,
			referenceId: FISCAL_ID,
			xml: createFiscalXml(),
		});

		expect(result.referenceUri).toBe(`#${FISCAL_ID}`);
		expect(result.signatureXml).toContain(`<Reference URI="#${FISCAL_ID}">`);
		expect(result.signatureXml).toContain('<X509Certificate>');
		expect(result.signedXml.indexOf('</infNFe>')).toBeLessThan(
			result.signedXml.indexOf('<Signature xmlns="http://www.w3.org/2000/09/xmldsig#">')
		);
		expect(verifySignedXml(result.signedXml, result.signatureXml)).toBe(true);
	});

	it('bloqueia assinatura quando o XML ja possui Signature', async () => {
		const service = new SignXmlService();
		const signedXml = createFiscalXml().replace(
			'</NFe>',
			'<Signature xmlns="http://www.w3.org/2000/09/xmldsig#"></Signature></NFe>'
		);

		await expect(
			service.sign({
				certificateBuffer: createTestCertificateBuffer(),
				certificatePassword: CERTIFICATE_PASSWORD,
				referenceId: FISCAL_ID,
				xml: signedXml,
			})
		).rejects.toThrow('XML fiscal ja possui assinatura digital');
	});
});

function verifySignedXml(signedXml: string, signatureXml: string) {
	const document = new DOMParser().parseFromString(signedXml, 'application/xml');
	const signatureDocument = new DOMParser().parseFromString(signatureXml, 'application/xml');
	const signature = signatureDocument.documentElement;
	const verifier = new SignedXml({
		getCertFromKeyInfo: SignedXml.getCertFromKeyInfo,
	});

	verifier.loadSignature(signature);

	const isValid = verifier.checkSignature(document.toString());
	const signedReferences = verifier.getSignedReferences();

	return isValid && signedReferences.length === 1 && signedReferences[0]?.includes(FISCAL_ID);
}

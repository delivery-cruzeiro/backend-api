import { DOMParser } from '@xmldom/xmldom';
import { execFileSync } from 'node:child_process';
import { createPrivateKey, X509Certificate } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { SignedXml } from 'xml-crypto';
import { CertificateService } from '../../src/services/fiscal/shared/signing/certificate.service.js';
import { CanonicalizationService } from '../../src/services/fiscal/shared/signing/canonicalization.service.js';
import { DigestService } from '../../src/services/fiscal/shared/signing/digest.service.js';
import { SignXmlService } from '../../src/services/fiscal/shared/signing/sign-xml.service.js';

const CERTIFICATE_PASSWORD = 'senha-teste';
const FISCAL_ID = 'NFe25260512345678000199650090000000011000182730';

function createTestCertificateBuffer(legacy = false, withoutKey = false) {
	const directory = mkdtempSync(join(tmpdir(), 'fiscal-certificate-test-'));
	const keyPath = join(directory, 'key.pem');
	const certPath = join(directory, 'cert.pem');
	try {
		execFileSync(
			'openssl',
			[
				'req',
				'-x509',
				'-newkey',
				'rsa:2048',
				'-noenc',
				'-days',
				'2',
				'-subj',
				'/CN=Delivery Cruzeiro Teste',
				'-keyout',
				keyPath,
				'-out',
				certPath,
			],
			{ stdio: 'ignore' }
		);
		return execFileSync('openssl', [
			'pkcs12',
			'-export',
			...(legacy ? ['-legacy'] : []),
			...(withoutKey ? ['-nokeys'] : ['-inkey', keyPath]),
			'-in',
			certPath,
			'-passout',
			`pass:${CERTIFICATE_PASSWORD}`,
		]);
	} finally {
		rmSync(directory, { recursive: true, force: true });
	}
}

function createFiscalXml() {
	return `<NFe xmlns="http://www.portalfiscal.inf.br/nfe"><infNFe Id="${FISCAL_ID}" versao="4.00"><ide><cUF>25</cUF></ide></infNFe></NFe>`;
}

describe('CertificateService', () => {
	it('carrega A1 legado com RC2 e encontra o certificado correspondente a chave', async () => {
		const loaded = await new CertificateService().load({
			certificateBuffer: createTestCertificateBuffer(true),
			certificatePassword: CERTIFICATE_PASSWORD,
		});
		expect(
			new X509Certificate(loaded.certificatePem).checkPrivateKey(
				createPrivateKey(loaded.privateKeyPem)
			)
		).toBe(true);
	});

	it('carrega A1 de arquivo montado sem alterar sua origem', async () => {
		const directory = mkdtempSync(join(tmpdir(), 'fiscal-certificate-file-test-'));
		const certificatePath = join(directory, 'a1.pfx');
		try {
			writeFileSync(certificatePath, createTestCertificateBuffer(), { mode: 0o600 });
			const before = readFileSync(certificatePath);
			const loaded = await new CertificateService().load({
				certificatePath,
				certificatePassword: CERTIFICATE_PASSWORD,
			});
			expect(loaded.source).toBe('file');
			expect(readFileSync(certificatePath)).toEqual(before);
		} finally {
			rmSync(directory, { recursive: true, force: true });
		}
	});

	it('rejeita senha incorreta sem expor senha ou diagnostico OpenSSL', async () => {
		await expect(
			new CertificateService().load({
				certificateBuffer: createTestCertificateBuffer(),
				certificatePassword: 'wrong-password',
			})
		).rejects.toThrow(
			'Nao foi possivel abrir o certificado digital A1. Confira o arquivo e a senha.'
		);
	});

	it('rejeita dados malformados e bundle adulterado sem desativar validacao MAC', async () => {
		const service = new CertificateService();
		await expect(
			service.load({ certificateBuffer: Buffer.from('not a certificate') })
		).rejects.toThrow('Nao foi possivel abrir');
		const corrupted = createTestCertificateBuffer();
		corrupted[corrupted.length - 1] ^= 1;
		await expect(
			service.load({
				certificateBuffer: corrupted,
				certificatePassword: CERTIFICATE_PASSWORD,
			})
		).rejects.toThrow('Nao foi possivel abrir');
	});

	it('rejeita PFX sem chave privada e senha com quebra de linha', async () => {
		const service = new CertificateService();
		await expect(
			service.load({
				certificateBuffer: createTestCertificateBuffer(false, true),
				certificatePassword: CERTIFICATE_PASSWORD,
			})
		).rejects.toThrow('Chave privada nao encontrada');
		await expect(
			service.load({
				certificateBuffer: Buffer.from('invalid'),
				certificatePassword: 'first\nsecond',
			})
		).rejects.toThrow('caracteres invalidos');
	});
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

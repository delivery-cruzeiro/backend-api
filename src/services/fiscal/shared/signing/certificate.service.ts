import { readdir, readFile } from 'node:fs/promises';
import { extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import forge from 'node-forge';

export const DEFAULT_DIGITAL_CERTIFICATES_DIRECTORY = fileURLToPath(
	new URL('../../Certificados digitais/', import.meta.url)
);

export interface LoadDigitalCertificateInput {
	certificateBuffer?: Buffer;
	certificatePassword?: string;
	certificatePath?: string;
}

export interface LoadedDigitalCertificate {
	certificateBase64: string;
	certificatePem: string;
	privateKeyPem: string;
	source: 'buffer' | 'file';
}

export class CertificateService {
	async load(input: LoadDigitalCertificateInput = {}): Promise<LoadedDigitalCertificate> {
		const certificateBuffer =
			input.certificateBuffer ?? (await this.readCertificateFile(input));
		const password = input.certificatePassword ?? process.env.CERTIFICATE_PASSWORD ?? '';
		const p12Asn1 = forge.asn1.fromDer(certificateBuffer.toString('binary'));
		const p12 = forge.pkcs12.pkcs12FromAsn1(p12Asn1, false, password);
		const privateKey = this.findPrivateKey(p12);
		const certificate = this.findCertificate(p12);
		const privateKeyPem = forge.pki.privateKeyToPem(privateKey);
		const certificatePem = forge.pki.certificateToPem(certificate);

		return {
			certificateBase64: normalizeCertificateBase64(certificatePem),
			certificatePem,
			privateKeyPem,
			source: input.certificateBuffer ? 'buffer' : 'file',
		};
	}

	private async readCertificateFile(input: LoadDigitalCertificateInput) {
		const certificatePath = input.certificatePath ?? process.env.CERTIFICATE_PATH;

		if (certificatePath) {
			return readFile(certificatePath);
		}

		const defaultCertificatePath = await this.findDefaultCertificatePath();

		if (!defaultCertificatePath) {
			throw new Error(
				'Certificado digital nao encontrado. Informe CERTIFICATE_PATH ou adicione um arquivo .pfx/.p12 em services/fiscal/Certificados digitais.'
			);
		}

		return readFile(defaultCertificatePath);
	}

	private async findDefaultCertificatePath() {
		const entries = await readdir(DEFAULT_DIGITAL_CERTIFICATES_DIRECTORY, {
			withFileTypes: true,
		}).catch(() => []);

		const certificateFile = entries.find(entry => {
			if (!entry.isFile()) {
				return false;
			}

			const extension = extname(entry.name).toLowerCase();

			return extension === '.pfx' || extension === '.p12';
		});

		return certificateFile
			? join(DEFAULT_DIGITAL_CERTIFICATES_DIRECTORY, certificateFile.name)
			: null;
	}

	private findPrivateKey(p12: forge.pkcs12.Pkcs12Pfx) {
		const keyBag =
			this.findBagWithPrivateKey(p12, forge.pki.oids.pkcs8ShroudedKeyBag) ??
			this.findBagWithPrivateKey(p12, forge.pki.oids.keyBag);

		if (!keyBag?.key) {
			throw new Error('Chave privada nao encontrada no certificado digital A1');
		}

		return keyBag.key;
	}

	private findCertificate(p12: forge.pkcs12.Pkcs12Pfx) {
		const certBag = this.findBagWithCertificate(p12, forge.pki.oids.certBag);

		if (!certBag?.cert) {
			throw new Error('Certificado publico nao encontrado no arquivo A1');
		}

		return certBag.cert;
	}

	private findBagWithPrivateKey(p12: forge.pkcs12.Pkcs12Pfx, bagType: string) {
		return p12.getBags({ bagType })[bagType]?.find(bag => Boolean(bag.key));
	}

	private findBagWithCertificate(p12: forge.pkcs12.Pkcs12Pfx, bagType: string) {
		return p12.getBags({ bagType })[bagType]?.find(bag => Boolean(bag.cert));
	}
}

function normalizeCertificateBase64(certificatePem: string) {
	return certificatePem
		.replace(/-----BEGIN CERTIFICATE-----/g, '')
		.replace(/-----END CERTIFICATE-----/g, '')
		.replace(/\s/g, '');
}

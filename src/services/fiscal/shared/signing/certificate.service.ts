import { readFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { createPrivateKey, X509Certificate } from 'node:crypto';
import type { Writable } from 'node:stream';

export const DEFAULT_DIGITAL_CERTIFICATES_DIRECTORY = '/run/secrets';

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
		const pem = await extractPkcs12(certificateBuffer, password);
		const keyPem = pem.match(
			/-----BEGIN (?:RSA )?PRIVATE KEY-----[\s\S]+?-----END (?:RSA )?PRIVATE KEY-----/
		)?.[0];
		if (!keyPem) throw new Error('Chave privada nao encontrada no certificado digital A1');
		const privateKey = createPrivateKey(keyPem);
		const certificate = (
			pem.match(/-----BEGIN CERTIFICATE-----[\s\S]+?-----END CERTIFICATE-----/g) ?? []
		)
			.map(value => new X509Certificate(value))
			.find(value => value.checkPrivateKey(privateKey));
		if (!certificate)
			throw new Error(
				'Certificado publico correspondente a chave privada nao encontrado no arquivo A1'
			);
		const privateKeyPem = privateKey.export({ type: 'pkcs1', format: 'pem' }).toString();
		const certificatePem = certificate.toString();

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

		throw new Error('Configure CERTIFICATE_PATH with a mounted private certificate');
	}
}

function extractPkcs12(buffer: Buffer, password: string): Promise<string> {
	// OpenSSL password descriptors are line based. Never silently truncate a password.
	if (/[\r\n\0]/.test(password))
		throw new Error('Senha do certificado A1 contem caracteres invalidos');
	return new Promise((resolve, reject) => {
		const child = spawn('openssl', ['pkcs12', '-legacy', '-noenc', '-passin', 'fd:3'], {
			stdio: ['pipe', 'pipe', 'pipe', 'pipe'],
			shell: false,
			windowsHide: true,
			timeout: 10_000,
		});
		const chunks: Buffer[] = [];
		let size = 0;
		const failure = () =>
			reject(
				new Error(
					'Nao foi possivel abrir o certificado digital A1. Confira o arquivo e a senha.'
				)
			);
		child.on('error', failure);
		child.stdout.on('data', (chunk: Buffer) => {
			size += chunk.length;
			if (size > 16 * 1024 * 1024) {
				child.kill();
				failure();
				return;
			}
			chunks.push(chunk);
		});
		// Diagnostics can contain certificate metadata: drain them without logging or retaining them.
		child.stderr.resume();
		child.on('close', code =>
			code === 0 ? resolve(Buffer.concat(chunks).toString('utf8')) : failure()
		);
		const passwordPipe = child.stdio[3] as Writable;
		passwordPipe.on('error', failure);
		child.stdin.on('error', failure);
		passwordPipe.end(password + '\n');
		child.stdin.end(buffer);
	});
}

function normalizeCertificateBase64(certificatePem: string) {
	return certificatePem
		.replace(/-----BEGIN CERTIFICATE-----/g, '')
		.replace(/-----END CERTIFICATE-----/g, '')
		.replace(/\s/g, '');
}

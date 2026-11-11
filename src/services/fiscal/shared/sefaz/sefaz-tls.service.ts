import { readFile } from 'node:fs/promises';
import { rootCertificates } from 'node:tls';
import { X509Certificate } from 'node:crypto';

export async function loadSefazTrustedRoots() {
	const pem = await readFile(new URL('../../../../../resources/fiscal/icp-brasil-v10.pem', import.meta.url), 'utf8');
	const certificate = new X509Certificate(pem);
	if (!certificate.ca || certificate.fingerprint256.replace(/:/g, '') !== '6E0BFF069A26994C15DE2C4888CC54AF84882E5495B7FBF66BE9CCFFEC7489F6')
		throw new Error('Raiz TLS pública da ICP-Brasil inválida.');
	return [...rootCertificates, pem];
}

import { expect, it } from 'vitest';
import { X509Certificate } from 'node:crypto';
import { rootCertificates } from 'node:tls';
import { loadSefazTrustedRoots } from '../../src/services/fiscal/shared/sefaz/sefaz-tls.service.js';

it('acrescenta a raiz pública SSL da ICP-Brasil sem remover as raízes padrão', async () => {
	const roots = await loadSefazTrustedRoots();
	expect(roots.slice(0, -1)).toEqual([...rootCertificates]);
	const added = new X509Certificate(roots.at(-1)!);
	expect(added.ca).toBe(true);
	expect(added.verify(added.publicKey)).toBe(true);
	expect(added.fingerprint256.replace(/:/g, '')).toBe('6E0BFF069A26994C15DE2C4888CC54AF84882E5495B7FBF66BE9CCFFEC7489F6');
});

import { createHash } from 'node:crypto';
import { CanonicalizationService } from './canonicalization.service.js';

export const XML_DIGEST_ALGORITHMS = {
	SHA1: 'http://www.w3.org/2000/09/xmldsig#sha1',
	SHA256: 'http://www.w3.org/2001/04/xmlenc#sha256',
} as const;

type DigestAlgorithm = (typeof XML_DIGEST_ALGORITHMS)[keyof typeof XML_DIGEST_ALGORITHMS];

const HASH_BY_DIGEST_ALGORITHM: Record<DigestAlgorithm, string> = {
	[XML_DIGEST_ALGORITHMS.SHA1]: 'sha1',
	[XML_DIGEST_ALGORITHMS.SHA256]: 'sha256',
};

export interface CalculateDigestInput {
	algorithm?: DigestAlgorithm;
	referenceId?: string;
	xml: string;
}

export class DigestService {
	constructor(private readonly canonicalizationService = new CanonicalizationService()) {}

	calculate(input: CalculateDigestInput) {
		const canonicalXml = this.canonicalizationService.canonicalize({
			referenceId: input.referenceId,
			xml: input.xml,
		});

		return this.calculateFromCanonicalXml(canonicalXml, input.algorithm);
	}

	calculateFromCanonicalXml(
		canonicalXml: string,
		algorithm: DigestAlgorithm = XML_DIGEST_ALGORITHMS.SHA1
	) {
		return createHash(HASH_BY_DIGEST_ALGORITHM[algorithm])
			.update(canonicalXml, 'utf8')
			.digest('base64');
	}
}

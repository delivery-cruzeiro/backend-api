import { createHash } from 'node:crypto';

const NFCE_QRCODE_VERSION = '2';
const PB_PRODUCTION_QRCODE_URL = 'https://www.sefaz.pb.gov.br/nfce/qrcode';
const PB_HOMOLOGATION_QRCODE_URL = 'https://www.sefaz.pb.gov.br/nfce/qrcode-homolog';

interface BuildNfceQrCodeUrlInput {
	accessKey: string;
	environment: string;
}

export class BuildNfceQrCodeUrlService {
	execute(input: BuildNfceQrCodeUrlInput) {
		const cscId = process.env.CSC_ID;
		const csc =
			input.environment === '1' ? process.env.CSC_PRODUCTION : process.env.CSC_HOMOLOGATION;

		if (!cscId || !csc) {
			throw new Error(
				'Configuracao do QRCode NFC-e incompleta. Informe CSC_ID e CSC_PRODUCTION/CSC_HOMOLOGATION.'
			);
		}

		const baseUrl = this.resolveBaseUrl(input.environment);
		const basePayload = [input.accessKey, NFCE_QRCODE_VERSION, input.environment, cscId].join(
			'|'
		);
		const hash = createHash('sha1').update(`${basePayload}${csc}`).digest('hex').toUpperCase();

		return `${baseUrl}?p=${basePayload}|${hash}`;
	}

	private resolveBaseUrl(environment: string) {
		if (environment === '1') {
			return process.env.NFCE_QRCODE_URL_PRODUCTION ?? PB_PRODUCTION_QRCODE_URL;
		}

		return process.env.NFCE_QRCODE_URL_HOMOLOGATION ?? PB_HOMOLOGATION_QRCODE_URL;
	}
}

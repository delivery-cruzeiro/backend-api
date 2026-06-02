import type { DanfeNfcePrintPayload } from './danfe-nfce.types.js';
import { DanfeNfceXmlParserService } from './danfe-nfce-xml-parser.service.js';
import { EscPosBuilderService } from './escpos-builder.service.js';

interface GenerateDanfeNfceInput {
	authorizationDate?: string | null;
	protocol?: string | null;
	xml: string;
}

export class GenerateDanfeNfceService {
	constructor(
		private readonly parser = new DanfeNfceXmlParserService(),
		private readonly escposBuilder = new EscPosBuilderService()
	) {}

	execute(input: GenerateDanfeNfceInput): DanfeNfcePrintPayload {
		const data = this.parser.execute(input);
		const escpos = this.escposBuilder.execute(data);

		return {
			accessKey: data.accessKey,
			columns: 48,
			contentBase64: Buffer.from(escpos).toString('base64'),
			encoding: 'base64',
			format: 'ESC_POS',
			qrCodeUrl: data.qrCodeUrl,
		};
	}
}

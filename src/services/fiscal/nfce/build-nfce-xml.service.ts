import type { FiscalXmlBuildInput } from '../shared/types/fiscal-emission.types.js';
import { buildSaleXml } from '../shared/xml/fiscal-xml.helpers.js';
import { BuildNfceQrCodeUrlService } from '../danfe/build-nfce-qrcode-url.service.js';

export class BuildNfceXmlService {
	constructor(private readonly qr = new BuildNfceQrCodeUrlService()) {}

	execute(input: FiscalXmlBuildInput) {
		return buildSaleXml(input, {
			print: 4,
			presence: input.sale.delivery ? 4 : 1,
			supplement: this.qr.buildOnline(input.identity.accessKey, input.environment),
		});
	}
}

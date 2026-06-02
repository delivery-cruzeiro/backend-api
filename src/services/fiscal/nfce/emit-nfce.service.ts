import { FiscalDocumentType } from '@prisma/client';
import { FiscalEmissionService } from '../shared/fiscal-emission.service.js';
import { FISCAL_DOCUMENT_MODELS } from '../shared/types/fiscal-id.types.js';
import { BuildNfceXmlService } from './build-nfce-xml.service.js';

export class EmitNfceService {
	constructor(
		private readonly fiscalEmissionService = new FiscalEmissionService(),
		private readonly xmlBuilder = new BuildNfceXmlService()
	) {}

	async execute(orderId: string) {
		return this.fiscalEmissionService.emit({
			allowOfflineContingency: true,
			documentType: FiscalDocumentType.NFCE,
			generateDanfe: true,
			model: FISCAL_DOCUMENT_MODELS.NFCE,
			orderId,
			xmlBuilder: this.xmlBuilder,
		});
	}

	async executeTest(orderId: string) {
		return this.fiscalEmissionService.emit({
			allowOfflineContingency: false,
			documentType: FiscalDocumentType.NFCE,
			generateDanfe: true,
			model: FISCAL_DOCUMENT_MODELS.NFCE,
			orderId,
			test: true,
			xmlBuilder: this.xmlBuilder,
		});
	}
}

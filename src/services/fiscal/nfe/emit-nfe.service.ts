import { FiscalDocumentType } from '@prisma/client';
import { FiscalEmissionService } from '../shared/fiscal-emission.service.js';
import { FISCAL_DOCUMENT_MODELS } from '../shared/types/fiscal-id.types.js';
import { BuildNfeXmlService } from './build-nfe-xml.service.js';

export class EmitNfeService {
	constructor(
		private readonly fiscalEmissionService = new FiscalEmissionService(),
		private readonly xmlBuilder = new BuildNfeXmlService()
	) {}

	async execute(orderId: string) {
		return this.fiscalEmissionService.emit({
			allowOfflineContingency: false,
			documentType: FiscalDocumentType.NFE,
			model: FISCAL_DOCUMENT_MODELS.NFE,
			orderId,
			xmlBuilder: this.xmlBuilder,
		});
	}

	async executeTest(orderId: string) {
		return this.fiscalEmissionService.emit({
			allowOfflineContingency: false,
			documentType: FiscalDocumentType.NFE,
			model: FISCAL_DOCUMENT_MODELS.NFE,
			orderId,
			test: true,
			xmlBuilder: this.xmlBuilder,
		});
	}
}

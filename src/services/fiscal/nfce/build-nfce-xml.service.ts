import { BuildNfeXmlService } from '../nfe/build-nfe-xml.service.js';
import type {
	FiscalXmlBuildInput,
	FiscalXmlBuildResult,
} from '../shared/types/fiscal-emission.types.js';

export class BuildNfceXmlService {
	constructor(private readonly nfeXmlBuilder = new BuildNfeXmlService()) {}

	execute(input: FiscalXmlBuildInput): FiscalXmlBuildResult {
		const result = this.nfeXmlBuilder.execute(input);

		return {
			referenceId: result.referenceId,
			xml: result.xml.replace('<tpImp>1</tpImp>', '<tpImp>4</tpImp>'),
		};
	}
}

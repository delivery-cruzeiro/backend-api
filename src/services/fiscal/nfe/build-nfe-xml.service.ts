import type { FiscalXmlBuildInput } from '../shared/types/fiscal-emission.types.js';
import { buildSaleXml } from '../shared/xml/fiscal-xml.helpers.js';

export class BuildNfeXmlService {
	execute(input: FiscalXmlBuildInput) {
		return buildSaleXml(input, { print: 1, presence: input.sale.delivery ? 2 : 1 });
	}
}

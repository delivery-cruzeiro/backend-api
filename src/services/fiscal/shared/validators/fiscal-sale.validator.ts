import type { FiscalSaleRecord } from '../../../../repositories/sales.repository.js';
import type { FiscalDocumentModel } from '../types/fiscal-id.types.js';

export class FiscalSaleValidator {
	validate(sale: FiscalSaleRecord, model: FiscalDocumentModel) {
		if (sale.items.length === 0) {
			return 'Pedido sem itens para emissao fiscal';
		}

		if (Number(sale.total) <= 0) {
			return 'Pedido com total invalido para emissao fiscal';
		}

		if (model === '55' && !sale.address) {
			return 'NF-e exige endereco de entrega no pedido';
		}

		return null;
	}
}

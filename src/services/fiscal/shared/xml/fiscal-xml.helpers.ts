import type { FiscalSaleRecord } from '../../../../repositories/sales.repository.js';

export function formatDecimal(value: unknown) {
	return Number(value).toFixed(2);
}

export function formatQuantity(value: number) {
	return value.toFixed(4);
}

export function onlyDigits(value: string | null | undefined) {
	return value?.replace(/\D/g, '') ?? '';
}

export function toFiscalDateTime(date: Date) {
	return date.toISOString();
}

export function calculateItemsTotal(sale: FiscalSaleRecord) {
	return sale.items.reduce((total, item) => total + Number(item.price) * item.quantity, 0);
}

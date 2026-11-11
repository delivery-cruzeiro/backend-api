import type { Prisma } from '@prisma/client';

export type FiscalItemSettings = {
	unit?: string | null;
	origin?: string | null;
	gtin?: string | null;
	csosn?: string | null;
	pisCst?: string | null;
	cofinsCst?: string | null;
};

export const fiscalItemProperties = {
	unit: { type: ['string', 'null'], pattern: '^(?:[A-Z0-9]{1,6})?$' },
	origin: { type: ['string', 'null'], pattern: '^[0-8]?$' },
	gtin: { type: ['string', 'null'], pattern: '^(?:SEM GTIN|[0-9]{8}|[0-9]{12,14})?$' },
	csosn: { type: ['string', 'null'], enum: [null, '', '102', '500'] },
	pisCst: { type: ['string', 'null'], enum: [null, '', '99'] },
	cofinsCst: { type: ['string', 'null'], enum: [null, '', '99'] },
} as const;

export function fiscalObject(value: unknown): Prisma.JsonObject {
	return value && typeof value === 'object' && !Array.isArray(value)
		? (value as Prisma.JsonObject)
		: {};
}

// Only update the submitted fields. Null clears an override and restores inheritance.
export function mergeFiscalItemSettings(previous: unknown, settings: FiscalItemSettings) {
	return {
		...fiscalObject(previous),
		...Object.fromEntries(Object.entries(settings).map(([key, value]) => [key, value || null])),
	};
}

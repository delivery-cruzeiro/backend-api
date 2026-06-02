export const FISCAL_DOCUMENT_MODELS = {
	NFCE: '65',
	NFE: '55',
} as const;

export const FISCAL_EMISSION_TYPES = {
	CONTINGENCY_NFCE: '9',
	NORMAL: '1',
} as const;

export const DEFAULT_FISCAL_SERIE = '009';

export type FiscalDocumentModel =
	(typeof FISCAL_DOCUMENT_MODELS)[keyof typeof FISCAL_DOCUMENT_MODELS];

export type FiscalEmissionType = (typeof FISCAL_EMISSION_TYPES)[keyof typeof FISCAL_EMISSION_TYPES];

export interface FiscalAccessKeyInput {
	emissionType: FiscalEmissionType;
	invoiceNumber: number;
	issueDate: Date;
	issuerCnpj: string;
	model: FiscalDocumentModel;
	orderNumber: number;
	serie: string;
	stateCode: string;
}

export interface FiscalAccessKeyParts {
	checkDigit: string;
	fiscalNumber: string;
	monthYear: string;
	numericCode: string;
	partialKey: string;
	serie: string;
}

export interface FiscalIdentity {
	accessKey: string;
	checkDigit: string;
	emissionType: FiscalEmissionType;
	fiscalId: string;
	fiscalNumber: string;
	model: FiscalDocumentModel;
	numericCode: string;
	serie: string;
}

export interface CreateFiscalIdentityInput {
	emissionType?: FiscalEmissionType;
	issueDate?: Date;
	issuerCnpj: string;
	model: FiscalDocumentModel;
	orderId: string;
	serie?: string;
	stateCode: string;
}

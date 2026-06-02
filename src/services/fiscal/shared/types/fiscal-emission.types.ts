import type { FiscalDocumentStatus, FiscalDocumentType } from '@prisma/client';
import type { FiscalSaleRecord } from '../../../../repositories/sales.repository.js';
import type { DanfeNfcePrintPayload } from '../../danfe/danfe-nfce.types.js';
import type { FiscalIdentity } from './fiscal-id.types.js';

export interface FiscalIssuerConfig {
	address: {
		city: string;
		complement: string | null;
		neighborhood: string;
		number: string;
		state: string;
		street: string;
		zipCode: string;
	};
	cityCode: string;
	cnpj: string;
	name: string;
	phoneNumber: string | null;
	stateCode: string;
	storeId: string;
	tradeName: string;
}

export interface FiscalXmlBuildInput {
	identity: FiscalIdentity;
	issuer: FiscalIssuerConfig;
	sale: FiscalSaleRecord;
	test?: boolean;
}

export interface FiscalXmlBuildResult {
	referenceId: string;
	xml: string;
}

export interface SefazTransmitInput {
	documentType: FiscalDocumentType;
	signedXml: string;
	test?: boolean;
}

export interface SefazTransmitResult {
	connectionError?: boolean;
	protocol?: string;
	rawResponse?: string;
	status: 'AUTHORIZED' | 'REJECTED';
	statusCode?: string;
	statusMessage?: string;
}

export interface FiscalEmissionDocument {
	accessKey: string | null;
	emissionType: string | null;
	fiscalNumber: string | null;
	id: string;
	model: string | null;
	orderId: string;
	protocol: string | null;
	qrCodeUrl: string | null;
	serie: string | null;
	status: FiscalDocumentStatus;
	type: FiscalDocumentType;
	xmlPath: string | null;
}

export interface FiscalEmissionSuccess {
	accessKey: string;
	danfe?: DanfeNfcePrintPayload;
	document: FiscalEmissionDocument;
	fiscalId: string;
	message: string;
	protocol?: string;
	signedXml?: string;
	status: FiscalDocumentStatus;
	success: true;
}

export interface FiscalEmissionFailure {
	error: string;
	statusCode: 400 | 404 | 500;
	success: false;
}

export type FiscalEmissionResult = FiscalEmissionFailure | FiscalEmissionSuccess;

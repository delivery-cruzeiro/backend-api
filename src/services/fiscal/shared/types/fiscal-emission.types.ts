import type { FiscalDocumentType } from '@prisma/client';
import type { FiscalIdentity } from './fiscal-id.types.js';

export type FiscalEnvironment = '1' | '2';
export type FiscalAddress = {
	street: string;
	number: string;
	neighborhood: string;
	city: string;
	cityCode: string;
	state: string;
	zipCode: string;
	complement?: string;
};

export interface FiscalSaleSnapshot {
	issuer: {
		cnpj: string;
		ie: string;
		crt: '1';
		name: string;
		tradeName: string;
		address: FiscalAddress;
	};
	recipient?: {
		id: string;
		name: string;
		taxIndicator: '1' | '2' | '9';
		ie?: string;
		address?: FiscalAddress;
	};
	items: Array<{
		code: string;
		name: string;
		ncm: string;
		cfop: string;
		unit: string;
		origin: string;
		gtin: string;
		quantity: number;
		csosn: '102' | '500';
		pisCst: '99';
		cofinsCst: '99';
		price: number;
		freight: number;
		discount: number;
	}>;
	total: number;
	payment: '01' | '20';
	delivery: boolean;
	finalConsumer: boolean;
	orderNumber: number;
}

export interface FiscalXmlBuildInput {
	identity: FiscalIdentity;
	sale: FiscalSaleSnapshot;
	issuedAt: Date;
	environment: FiscalEnvironment;
}

export interface FiscalXmlBuildResult {
	referenceId: string;
	xml: string;
}

export interface SefazDocumentInput {
	documentType: FiscalDocumentType;
	accessKey: string;
	environment: FiscalEnvironment;
	issuerCnpj: string;
}

export interface SefazTransmitInput extends SefazDocumentInput {
	signedXml: string;
	batchId: string;
}

export type SefazTransmitResult =
	| {
			status: 'AUTHORIZED';
			protocol: string;
			protocolXml: string;
			authorizedAt: Date;
			statusCode: string;
	  }
	| { status: 'AWAITING_SEFAZ'; receipt?: string; statusCode?: string; statusMessage: string }
	| { status: 'REJECTED'; statusCode: string; statusMessage: string };

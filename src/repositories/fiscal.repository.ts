import type {
	FiscalDocumentStatus,
	FiscalDocumentType,
	Prisma,
	PrismaClient,
} from '@prisma/client';
import { prisma } from '../lib/prisma.js';

export interface ReserveFiscalSequenceInput {
	model: string;
	serie: string;
}

export interface SaveFiscalDocumentInput {
	accessKey: string;
	emissionType: string;
	fiscalNumber: string;
	model: string;
	orderId: string;
	protocol?: string | null;
	qrCodeUrl?: string | null;
	sefazResponse?: Prisma.InputJsonValue;
	serie: string;
	status: FiscalDocumentStatus;
	type: FiscalDocumentType;
	xmlContent: string;
	xmlPath?: string | null;
}

export interface FiscalDocumentRecord {
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

export interface FiscalSequenceRepository {
	reserveNextNumber(input: ReserveFiscalSequenceInput): Promise<number>;
}

export interface FiscalDocumentRepository {
	save(input: SaveFiscalDocumentInput): Promise<FiscalDocumentRecord>;
	updateQrCodeUrl(id: string, qrCodeUrl: string): Promise<FiscalDocumentRecord>;
}

export class PrismaFiscalSequenceRepository implements FiscalSequenceRepository {
	constructor(private readonly database: PrismaClient = prisma) {}

	async reserveNextNumber(input: ReserveFiscalSequenceInput) {
		const sequence = await this.database.fiscalSequence.upsert({
			where: {
				model_serie: {
					model: input.model,
					serie: input.serie,
				},
			},
			update: {
				currentNumber: {
					increment: 1,
				},
			},
			create: {
				currentNumber: 1,
				model: input.model,
				serie: input.serie,
			},
			select: {
				currentNumber: true,
			},
		});

		return sequence.currentNumber;
	}
}

export class PrismaFiscalDocumentRepository implements FiscalDocumentRepository {
	constructor(private readonly database: PrismaClient = prisma) {}

	async save(input: SaveFiscalDocumentInput) {
		return this.database.fiscalDocument.create({
			data: {
				accessKey: input.accessKey,
				emissionType: input.emissionType,
				fiscalNumber: input.fiscalNumber,
				model: input.model,
				orderId: input.orderId,
				protocol: input.protocol,
				qrCodeUrl: input.qrCodeUrl,
				sefazResponse: input.sefazResponse,
				serie: input.serie,
				status: input.status,
				type: input.type,
				xmlContent: input.xmlContent,
				xmlPath: input.xmlPath,
			},
			select: {
				accessKey: true,
				emissionType: true,
				fiscalNumber: true,
				id: true,
				model: true,
				orderId: true,
				protocol: true,
				qrCodeUrl: true,
				serie: true,
				status: true,
				type: true,
				xmlPath: true,
			},
		});
	}

	async updateQrCodeUrl(id: string, qrCodeUrl: string) {
		return this.database.fiscalDocument.update({
			data: {
				qrCodeUrl,
			},
			select: {
				accessKey: true,
				emissionType: true,
				fiscalNumber: true,
				id: true,
				model: true,
				orderId: true,
				protocol: true,
				qrCodeUrl: true,
				serie: true,
				status: true,
				type: true,
				xmlPath: true,
			},
			where: {
				id,
			},
		});
	}
}

import {
	Prisma,
	type FiscalDocument,
	type FiscalDocumentType,
	type PrismaClient,
} from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { prisma } from '../lib/prisma.js';
import type { FiscalEnvironment } from '../services/fiscal/shared/types/fiscal-emission.types.js';

export interface ReserveFiscalSequenceInput {
	model: string;
	serie: string;
	issuerCnpj?: string;
	environment?: string;
	lastNumber?: number;
}

export interface FiscalSequenceRepository {
	reserveNextNumber(input: ReserveFiscalSequenceInput): Promise<number>;
}

export class PrismaFiscalSequenceRepository implements FiscalSequenceRepository {
	constructor(private readonly database: PrismaClient = prisma) {}

	async reserveNextNumber(input: ReserveFiscalSequenceInput) {
		const { model, serie, issuerCnpj = 'LEGACY', environment = '0', lastNumber = 0 } = input;
		const key = { model, serie, issuerCnpj, environment };
		// Serialize initial sequence creation and increment in PostgreSQL.
		const row = await this.database.fiscalSequence.upsert({
			where: { issuerCnpj_environment_model_serie: key },
			update: { currentNumber: { increment: 1 } },
			create: { ...key, currentNumber: lastNumber + 1 },
			select: { currentNumber: true },
		});
		if (row.currentNumber > lastNumber) return row.currentNumber;
		const adjusted = await this.database.fiscalSequence.update({
			where: { issuerCnpj_environment_model_serie: key },
			data: { currentNumber: lastNumber + 1 },
			select: { currentNumber: true },
		});
		return adjusted.currentNumber;
	}
}

export class PrismaFiscalDocumentRepository {
	constructor(private readonly database: PrismaClient = prisma) {}

	transaction<T>(action: () => Promise<T>) {
		return this.database.$transaction(action);
	}

	findForSale(orderId: string, environment: FiscalEnvironment) {
		return this.database.fiscalDocument.findUnique({
			where: { orderId_environment: { orderId, environment } },
		});
	}

	findLegacy(orderId: string, environment: FiscalEnvironment) {
		return this.database.fiscalDocument.findFirst({
			where: {
				orderId,
				environment: null,
				...(environment === '2'
					? {
							sefazResponse: { path: ['testMode'], equals: true },
						}
					: {}),
			},
			select: { id: true },
		});
	}

	createIntent(
		orderId: string,
		environment: FiscalEnvironment,
		issuerCnpj: string,
		type: FiscalDocumentType
	) {
		return this.database.fiscalDocument.create({
			data: { orderId, environment, issuerCnpj, type },
		});
	}

	queue(
		id: string,
		data: Pick<
			FiscalDocument,
			'accessKey' | 'emissionType' | 'fiscalNumber' | 'model' | 'serie' | 'xmlContent'
		>
	) {
		return this.database.fiscalDocument.update({
			where: { id },
			data: { ...data, nextAttemptAt: new Date() },
		});
	}

	findById(orderId: string, id: string) {
		return this.database.fiscalDocument.findFirst({
			where: { orderId, id, environment: { not: null } },
		});
	}

	listForSale(orderId: string) {
		return this.database.fiscalDocument.findMany({
			where: { orderId, environment: { not: null } },
			orderBy: { environment: 'asc' },
		});
	}

	async requestReconciliation(orderId: string, id: string) {
		return this.database.fiscalDocument.updateMany({
			where: {
				id,
				orderId,
				environment: { not: null },
				status: 'AWAITING_SEFAZ',
				nextAttemptAt: null,
			},
			data: { nextAttemptAt: new Date() },
		});
	}

	async claim(now: Date, allowProduction: boolean) {
		const due = {
			environment: { in: ['1', '2'] },
			nextAttemptAt: { lte: now },
			OR: [{ leaseUntil: null }, { leaseUntil: { lte: now } }],
			AND: [
				{
					OR: [
						{
							status: 'PENDING',
							environment: { in: allowProduction ? ['1', '2'] : ['2'] },
						},
						{ status: { in: ['PROCESSING', 'AWAITING_SEFAZ'] } },
					],
				},
			],
		} satisfies Prisma.FiscalDocumentWhereInput;
		const document = await this.database.fiscalDocument.findFirst({
			where: due,
			orderBy: [{ nextAttemptAt: 'asc' }, { id: 'asc' }],
			include: { order: { select: { status: true } } },
		});
		if (!document) return null;
		const leaseToken = randomUUID();
		const updated = await this.database.fiscalDocument.updateMany({
			where: { ...due, id: document.id, status: document.status },
			data: {
				status: 'PROCESSING',
				leaseToken,
				leaseUntil: new Date(now.getTime() + 120_000),
			},
		});
		return updated.count ? { document, leaseToken } : null;
	}

	async finish(
		id: string,
		leaseToken: string,
		data: Prisma.FiscalDocumentUpdateManyMutationInput
	) {
		return this.database.fiscalDocument.updateMany({
			where: { id, leaseToken, status: 'PROCESSING' },
			data: { ...data, leaseToken: null, leaseUntil: null },
		});
	}
}

import {
	WhatsAppMessageLocation,
	WhatsAppMessageOperation,
	type CreateWhatsAppMessageConfigurationDTO,
	type UpdateWhatsAppMessageConfigurationDTO,
} from '@delivery-cruzeiro/types';
import type { Prisma, PrismaClient } from '@prisma/client';
import { prisma } from '../lib/prisma.js';

export const whatsappMessageConfigurationSelect = {
	id: true,
	location: true,
	operation: true,
	template: true,
	isActive: true,
	createdAt: true,
	updatedAt: true,
} satisfies Prisma.WhatsAppMessageConfigurationSelect;

export type WhatsAppMessageConfigurationRecord = Prisma.WhatsAppMessageConfigurationGetPayload<{
	select: typeof whatsappMessageConfigurationSelect;
}>;

export interface WhatsAppMessageConfigurationRepository {
	create(
		data: CreateWhatsAppMessageConfigurationDTO
	): Promise<WhatsAppMessageConfigurationRecord>;
	findActiveByEvent(
		location: WhatsAppMessageLocation,
		operation: WhatsAppMessageOperation
	): Promise<WhatsAppMessageConfigurationRecord[]>;
	findById(id: string): Promise<WhatsAppMessageConfigurationRecord | null>;
	list(): Promise<WhatsAppMessageConfigurationRecord[]>;
	update(
		id: string,
		data: UpdateWhatsAppMessageConfigurationDTO
	): Promise<WhatsAppMessageConfigurationRecord>;
}

export class PrismaWhatsAppMessageConfigurationRepository implements WhatsAppMessageConfigurationRepository {
	constructor(private readonly database: PrismaClient = prisma) {}

	create(data: CreateWhatsAppMessageConfigurationDTO) {
		return this.database.whatsAppMessageConfiguration.create({
			data: {
				isActive: data.isActive,
				location: data.location,
				operation: data.operation,
				template: data.template as unknown as Prisma.InputJsonValue,
			},
			select: whatsappMessageConfigurationSelect,
		});
	}

	findActiveByEvent(location: WhatsAppMessageLocation, operation: WhatsAppMessageOperation) {
		return this.database.whatsAppMessageConfiguration.findMany({
			where: { isActive: true, location, operation },
			orderBy: { createdAt: 'asc' },
			select: whatsappMessageConfigurationSelect,
		});
	}

	findById(id: string) {
		return this.database.whatsAppMessageConfiguration.findUnique({
			where: { id },
			select: whatsappMessageConfigurationSelect,
		});
	}

	list() {
		return this.database.whatsAppMessageConfiguration.findMany({
			orderBy: [{ location: 'asc' }, { operation: 'asc' }],
			select: whatsappMessageConfigurationSelect,
		});
	}

	update(id: string, data: UpdateWhatsAppMessageConfigurationDTO) {
		return this.database.whatsAppMessageConfiguration.update({
			where: { id },
			data: {
				...(data.isActive !== undefined && { isActive: data.isActive }),
				...(data.location !== undefined && { location: data.location }),
				...(data.operation !== undefined && { operation: data.operation }),
				...(data.template !== undefined && {
					template: data.template as unknown as Prisma.InputJsonValue,
				}),
			},
			select: whatsappMessageConfigurationSelect,
		});
	}
}

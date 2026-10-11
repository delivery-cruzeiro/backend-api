import {
	whatsappMessageTemplateSchema,
	type CreateWhatsAppMessageConfigurationDTO,
	type UpdateWhatsAppMessageConfigurationDTO,
	type WhatsAppMessageConfiguration,
	WhatsAppMessageLocation,
	WhatsAppMessageOperation,
	PaymentType,
} from '@delivery-cruzeiro/types';
import {
	PrismaWhatsAppMessageConfigurationRepository,
	type WhatsAppMessageConfigurationRecord,
	type WhatsAppMessageConfigurationRepository,
} from '../repositories/whatsapp-message-config.repository.js';
import { sanitizeWhatsAppMessageTemplate } from './whatsapp-message-template.service.js';

export class WhatsAppMessageConfigurationError extends Error {
	constructor(
		message: string,
		readonly statusCode: number
	) {
		super(message);
		this.name = 'WhatsAppMessageConfigurationError';
	}
}

function serializeConfiguration(
	record: WhatsAppMessageConfigurationRecord
): WhatsAppMessageConfiguration {
	const template = whatsappMessageTemplateSchema.safeParse(record.template);
	if (!template.success) {
		throw new WhatsAppMessageConfigurationError('Template de mensagem invalido', 500);
	}

	return {
		...record,
		paymentMethod: record.paymentMethod
			? { ...record.paymentMethod, type: record.paymentMethod.type as PaymentType }
			: null,
		location: record.location as WhatsAppMessageLocation,
		operation: record.operation as WhatsAppMessageOperation,
		template: template.data,
	};
}

function normalizeTemplate(data: CreateWhatsAppMessageConfigurationDTO) {
	const template = sanitizeWhatsAppMessageTemplate(data.template);
	const hasContent = template.html
		.replace(/<img\b[^>]*>/gi, ' imagem ')
		.replace(/<[^>]+>/g, '')
		.replace(/&nbsp;/g, ' ')
		.trim();

	if (!hasContent) {
		throw new WhatsAppMessageConfigurationError('Informe o conteudo da mensagem', 400);
	}

	return { ...data, template };
}

export class WhatsAppMessageConfigurationService {
	constructor(
		private readonly repository: WhatsAppMessageConfigurationRepository = new PrismaWhatsAppMessageConfigurationRepository()
	) {}

	async list() {
		return (await this.repository.list()).map(serializeConfiguration);
	}

	async create(data: CreateWhatsAppMessageConfigurationDTO) {
		try {
			return serializeConfiguration(await this.repository.create(normalizeTemplate(data)));
		} catch (error) {
			this.throwKnownError(error);
		}
	}

	async update(id: string, data: UpdateWhatsAppMessageConfigurationDTO) {
		const existing = await this.repository.findById(id);
		if (!existing) {
			throw new WhatsAppMessageConfigurationError('Configuracao nao encontrada', 404);
		}

		const normalized = data.template
			? normalizeTemplate({
					isActive: data.isActive ?? existing.isActive,
					location: (data.location ?? existing.location) as WhatsAppMessageLocation,
					operation: (data.operation ?? existing.operation) as WhatsAppMessageOperation,
					paymentMethodId: data.paymentMethodId === undefined ? existing.paymentMethodId : data.paymentMethodId,
					template: data.template,
				})
			: data;

		try {
			return serializeConfiguration(await this.repository.update(id, normalized));
		} catch (error) {
			this.throwKnownError(error);
		}
	}

	private throwKnownError(error: unknown): never {
		if (error instanceof WhatsAppMessageConfigurationError) throw error;
		if (
			typeof error === 'object' &&
			error !== null &&
			'code' in error &&
			error.code === 'P2002'
		) {
			throw new WhatsAppMessageConfigurationError(
				'Ja existe uma configuracao para este local e operacao',
				409
			);
		}
		throw error;
	}
}

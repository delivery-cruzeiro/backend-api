import {
	createWhatsAppMessageConfigurationSchema,
	formatZodError,
	updateWhatsAppMessageConfigurationSchema,
	type CreateWhatsAppMessageConfigurationDTO,
	type UpdateWhatsAppMessageConfigurationDTO,
} from '@delivery-cruzeiro/types';
import type { FastifyReply, FastifyRequest } from 'fastify';
import {
	WhatsAppMessageConfigurationError,
	WhatsAppMessageConfigurationService,
} from '../services/whatsapp-message-configuration.service.js';
import { uploadImage } from '../services/image-upload.service.js';

const service = new WhatsAppMessageConfigurationService();

function sendValidationError(reply: FastifyReply, error: ReturnType<typeof formatZodError>) {
	return reply.status(error.statusCode ?? 400).send({
		code: error.code,
		details: error.details,
		error: error.message,
	});
}

function sendServiceError(request: FastifyRequest, reply: FastifyReply, error: unknown) {
	if (error instanceof WhatsAppMessageConfigurationError) {
		return reply.status(error.statusCode).send({ error: error.message });
	}
	request.log.error(error, 'Erro na configuracao de mensagens automaticas do WhatsApp');
	return reply.status(500).send({ error: 'Erro interno do servidor' });
}

export async function listWhatsAppMessageConfigurations(
	request: FastifyRequest,
	reply: FastifyReply
) {
	try {
		const configurations = await service.list();
		return reply.send({ configurations, total: configurations.length });
	} catch (error) {
		return sendServiceError(request, reply, error);
	}
}

export async function createWhatsAppMessageConfiguration(
	request: FastifyRequest<{ Body: CreateWhatsAppMessageConfigurationDTO }>,
	reply: FastifyReply
) {
	const validation = createWhatsAppMessageConfigurationSchema.safeParse(request.body ?? {});
	if (!validation.success) {
		return sendValidationError(reply, formatZodError(validation.error));
	}

	try {
		const configuration = await service.create(validation.data);
		return reply.status(201).send({
			configuration,
			message: 'Configuracao criada com sucesso',
		});
	} catch (error) {
		return sendServiceError(request, reply, error);
	}
}

export async function updateWhatsAppMessageConfiguration(
	request: FastifyRequest<{
		Body: UpdateWhatsAppMessageConfigurationDTO;
		Params: { id: string };
	}>,
	reply: FastifyReply
) {
	const validation = updateWhatsAppMessageConfigurationSchema.safeParse(request.body ?? {});
	if (!validation.success) {
		return sendValidationError(reply, formatZodError(validation.error));
	}

	try {
		const configuration = await service.update(request.params.id, validation.data);
		return reply.send({
			configuration,
			message: 'Configuracao atualizada com sucesso',
		});
	} catch (error) {
		return sendServiceError(request, reply, error);
	}
}

export async function uploadWhatsAppMessageImage(request: FastifyRequest, reply: FastifyReply) {
	try {
		const image = await request.file();
		if (!image) {
			return reply.status(400).send({ error: 'Selecione uma imagem' });
		}
		if (!image.mimetype.startsWith('image/')) {
			return reply.status(400).send({ error: 'O arquivo deve ser uma imagem' });
		}

		const url = await uploadImage({
			buffer: await image.toBuffer(),
			filename: image.filename,
			folder: 'delivery-cruzeiro/whatsapp-messages',
			mimetype: image.mimetype,
		});
		return reply.status(201).send({ url });
	} catch (error) {
		request.log.error(error, 'Erro ao enviar imagem da mensagem automatica do WhatsApp');
		return reply.status(500).send({ error: 'Nao foi possivel enviar a imagem' });
	}
}

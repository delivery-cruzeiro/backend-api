import type { FastifyReply, FastifyRequest } from 'fastify';
import { getWhatsAppService } from '../integrations/whatsapp/whatsapp.factory.js';
import { WhatsAppIntegrationError } from '../integrations/whatsapp/whatsapp.errors.js';

function sendError(reply: FastifyReply, error: unknown) {
	if (error instanceof WhatsAppIntegrationError) {
		return reply.status(error.statusCode).send({ code: error.code, error: error.message });
	}

	return reply.status(500).send({ error: 'Erro interno do servidor' });
}

export async function getWhatsAppStatus(_request: FastifyRequest, reply: FastifyReply) {
	try {
		return reply.send(await getWhatsAppService().getStatus());
	} catch (error) {
		return sendError(reply, error);
	}
}

export async function connectWhatsApp(_request: FastifyRequest, reply: FastifyReply) {
	try {
		return reply.send(await getWhatsAppService().connect());
	} catch (error) {
		return sendError(reply, error);
	}
}

export async function getWhatsAppQrCode(_request: FastifyRequest, reply: FastifyReply) {
	try {
		return reply.send(await getWhatsAppService().getQrCode());
	} catch (error) {
		return sendError(reply, error);
	}
}

export async function disconnectWhatsApp(_request: FastifyRequest, reply: FastifyReply) {
	try {
		return reply.send(await getWhatsAppService().disconnect());
	} catch (error) {
		return sendError(reply, error);
	}
}

import {
	createPrinterConfigurationSchema,
	formatZodError,
	setPrinterAssignmentsSchema,
	updatePrinterConfigurationSchema,
} from '@delivery-cruzeiro/types';
import type { FastifyReply, FastifyRequest } from 'fastify';
import type { AuthenticatedRequest } from '../middleware/auth.middleware.js';
import {
	PrinterConfigurationError,
	PrinterConfigurationService,
} from '../services/printer-configuration.service.js';

const service = new PrinterConfigurationService();

function actor(request: FastifyRequest) {
	const user = (request as AuthenticatedRequest).user!;
	return { id: user.id, role: user.role };
}

function validationError(reply: FastifyReply, error: Parameters<typeof formatZodError>[0]) {
	const formatted = formatZodError(error);
	return reply.status(formatted.statusCode ?? 400).send({
		code: formatted.code,
		details: formatted.details,
		error: formatted.message,
	});
}

function serviceError(request: FastifyRequest, reply: FastifyReply, error: unknown) {
	if (error instanceof PrinterConfigurationError) {
		return reply.status(error.statusCode).send({ error: error.message });
	}
	request.log.error(error, 'Erro na configuracao de impressoras');
	return reply.status(500).send({ error: 'Erro interno do servidor' });
}

export async function listPrinterConfigurations(
	request: FastifyRequest<{ Querystring: { storeId?: string } }>,
	reply: FastifyReply
) {
	const storeId = request.query.storeId?.trim();
	if (!storeId) return reply.status(400).send({ error: 'storeId e obrigatorio' });
	try {
		const printers = await service.list(storeId, actor(request));
		return reply.send({ printers, total: printers.length });
	} catch (error) {
		return serviceError(request, reply, error);
	}
}

export async function createPrinterConfiguration(request: FastifyRequest, reply: FastifyReply) {
	const validation = createPrinterConfigurationSchema.safeParse(request.body ?? {});
	if (!validation.success) return validationError(reply, validation.error);
	try {
		return reply.status(201).send({
			printer: await service.create(validation.data, actor(request)),
			message: 'Impressora adicionada com sucesso',
		});
	} catch (error) {
		return serviceError(request, reply, error);
	}
}

export async function updatePrinterConfiguration(
	request: FastifyRequest<{ Params: { id: string } }>,
	reply: FastifyReply
) {
	const validation = updatePrinterConfigurationSchema.safeParse(request.body ?? {});
	if (!validation.success) return validationError(reply, validation.error);
	try {
		return reply.send({
			printer: await service.update(request.params.id, validation.data, actor(request)),
			message: 'Impressora atualizada com sucesso',
		});
	} catch (error) {
		return serviceError(request, reply, error);
	}
}

export async function setPrinterAssignments(
	request: FastifyRequest<{ Params: { id: string } }>,
	reply: FastifyReply
) {
	const validation = setPrinterAssignmentsSchema.safeParse(request.body ?? {});
	if (!validation.success) return validationError(reply, validation.error);
	try {
		return reply.send({
			printer: await service.setAssignments(request.params.id, validation.data, actor(request)),
			message: 'Selecao de categorias atualizada com sucesso',
		});
	} catch (error) {
		return serviceError(request, reply, error);
	}
}

export async function deletePrinterConfiguration(
	request: FastifyRequest<{ Params: { id: string } }>,
	reply: FastifyReply
) {
	try {
		await service.delete(request.params.id, actor(request));
		return reply.send({ message: 'Impressora removida com sucesso' });
	} catch (error) {
		return serviceError(request, reply, error);
	}
}

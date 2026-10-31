import type { FastifyReply, FastifyRequest } from 'fastify';
import type {
	RequestPasswordRecoveryDTO,
	VerifyPasswordRecoveryDTO,
	ResetRecoveredPasswordDTO,
} from '@delivery-cruzeiro/types';
import {
	PasswordRecoveryError,
	PasswordRecoveryService,
} from '../services/password-recovery.service.js';

export function createPasswordRecoveryController(service = new PasswordRecoveryService()) {
	async function handle(reply: FastifyReply, action: () => Promise<unknown>) {
		try {
			return reply.send(await action());
		} catch (error) {
			if (error instanceof PasswordRecoveryError)
				return reply.code(error.statusCode).send({ error: error.message });
			throw error;
		}
	}
	return {
		request: (
			request: FastifyRequest<{ Body: RequestPasswordRecoveryDTO }>,
			reply: FastifyReply
		) =>
			handle(reply, async () => {
				await service.request(request.body.email, () =>
					request.log.error('Password recovery email delivery failed')
				);
				return {
					message:
						'Se houver uma conta para este email, você receberá um código de recuperação.',
				};
			}),
		verify: (
			request: FastifyRequest<{ Body: VerifyPasswordRecoveryDTO }>,
			reply: FastifyReply
		) => handle(reply, () => service.verify(request.body.email, request.body.code)),
		reset: (
			request: FastifyRequest<{ Body: ResetRecoveredPasswordDTO }>,
			reply: FastifyReply
		) =>
			handle(reply, async () => {
				await service.reset(
					request.body.email,
					request.body.recoveryAuthorization,
					request.body.password
				);
				return { message: 'Senha alterada com sucesso. Entre com sua nova senha.' };
			}),
	};
}

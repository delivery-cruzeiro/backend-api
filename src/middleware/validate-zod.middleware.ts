import type { FastifyReply, FastifyRequest } from 'fastify';
import { formatZodError } from '@delivery-cruzeiro/types';

type RequestPart = 'body' | 'params' | 'query';
type ValidationError = Parameters<typeof formatZodError>[0];
type ValidationResult<TOutput> =
	| { success: true; data: TOutput }
	| { success: false; error: ValidationError };
type ValidationSchema<TOutput = unknown> = {
	safeParse(input: unknown): ValidationResult<TOutput>;
};

export function validateZod<TSchema extends ValidationSchema>(
	schema: TSchema,
	part: RequestPart = 'body'
) {
	return async (request: FastifyRequest, reply: FastifyReply) => {
		const result = schema.safeParse(request[part]);

		if (!result.success) {
			const error = formatZodError(result.error);

			return reply.status(error.statusCode ?? 400).send({
				error: error.message,
				code: error.code,
				details: error.details,
			});
		}

		Object.assign(request, {
			[part]: result.data,
		});
	};
}

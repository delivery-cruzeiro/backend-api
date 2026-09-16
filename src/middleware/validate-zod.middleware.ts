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

// Zod normally strips unknown fields. Reject them before replacing the body so
// callers cannot silently submit protected properties such as role or userId.
function hasRemovedKeys(input: unknown, output: unknown): boolean {
 if (Array.isArray(input) && Array.isArray(output)) return input.some((value,index)=>hasRemovedKeys(value,output[index]));
 if (!input || !output || typeof input!=='object' || typeof output!=='object' || Array.isArray(input)) return false;
 return Object.keys(input).some(key=>!Object.hasOwn(output,key) || hasRemovedKeys(Reflect.get(input,key),Reflect.get(output,key)));
}

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

		if (part === 'body' && hasRemovedKeys(request.body, result.data)) {
			return reply.status(400).send({error:'Campos nao permitidos'});
		}
		Object.assign(request, {
			[part]: result.data,
		});
	};
}

import type { FastifyInstance, FastifyReply } from 'fastify';
import { Prisma } from '@prisma/client';
import { requireManager } from '../middleware/auth.middleware.js';
import { prisma } from '../lib/prisma.js';
import {
	fiscalItemProperties,
	fiscalObject,
	mergeFiscalItemSettings,
	type FiscalItemSettings,
} from '../services/fiscal/shared/fiscal-settings.js';

const operationInclude = { classification: true } as const;
const selection = {
	type: 'object',
	additionalProperties: false,
	required: ['operationId'],
	properties: {
		operationId: { type: ['string', 'null'], minLength: 1, maxLength: 100 },
		fiscalData: {
			type: 'object',
			additionalProperties: false,
			properties: fiscalItemProperties,
		},
	},
} as const;

export async function fiscalCatalogRoutes(app: FastifyInstance) {
	const storeParams = {
		type: 'object',
		required: ['id'],
		properties: { id: { type: 'string', format: 'uuid' } },
	} as const;
	app.get<{ Params: { id: string } }>(
		'/fiscal/stores/:id',
		{
			preHandler: requireManager,
			schema: { params: storeParams },
		},
		async (request, reply) => {
			const store = await prisma.store.findUnique({
				where: { id: request.params.id },
				select: { id: true, cnpj: true, fiscalProfile: true },
			});
			if (!store) return reply.code(404).send({ error: 'Loja não encontrada.' });
			const profile = fiscalObject(store.fiscalProfile);
			return {
				id: store.id,
				cnpj: store.cnpj,
				ie: profile.ie ?? '',
				crt: profile.crt ?? '',
				taxDefaults: fiscalObject(profile.taxDefaults),
				homologation: {
					enabled: fiscalObject(profile.homologation).enabled === true,
					enable65: fiscalObject(profile.homologation).enable65 === true,
					allowDelivery: fiscalObject(profile.homologation).allowDelivery === true,
				},
			};
		}
	);
	app.put<{
		Params: { id: string };
		Body: {
			ie: string;
			crt: string;
			taxDefaults: FiscalItemSettings;
			homologation?: { allowDelivery: boolean };
		};
	}>(
		'/fiscal/stores/:id',
		{
			preHandler: requireManager,
			schema: {
				params: storeParams,
				body: {
					type: 'object',
					additionalProperties: false,
					required: ['ie', 'crt', 'taxDefaults'],
					properties: {
						homologation: {
							type: 'object',
							additionalProperties: false,
							required: ['allowDelivery'],
							properties: { allowDelivery: { type: 'boolean' } },
						},
						ie: { type: 'string', pattern: '^(?:[0-9]{9})?$' },
						crt: { type: 'string', enum: ['', '1'] },
						taxDefaults: {
							type: 'object',
							additionalProperties: false,
							required: ['csosn', 'pisCst', 'cofinsCst'],
							properties: {
								csosn: fiscalItemProperties.csosn,
								pisCst: fiscalItemProperties.pisCst,
								cofinsCst: fiscalItemProperties.cofinsCst,
							},
						},
					},
				},
			},
		},
		async (request, reply) => {
			try {
				return await prisma.$transaction(async tx => {
					const store = await tx.store.findUnique({
						where: { id: request.params.id },
						select: { fiscalProfile: true },
					});
					if (!store) return reply.code(404).send({ error: 'Loja não encontrada.' });
					const profile = fiscalObject(store.fiscalProfile);
					const taxDefaults = mergeFiscalItemSettings(
						profile.taxDefaults,
						request.body.taxDefaults
					);
					await tx.store.update({
						where: { id: request.params.id },
						data: {
							fiscalProfile: {
								...profile,
								...(request.body.homologation
									? {
											homologation: {
												...fiscalObject(profile.homologation),
												allowDelivery:
													request.body.homologation.allowDelivery,
											},
										}
									: {}),
								ie: request.body.ie,
								crt: request.body.crt,
								taxDefaults,
							},
						},
					});
					return {
						id: request.params.id,
						ie: request.body.ie,
						crt: request.body.crt,
						taxDefaults,
					};
				});
			} catch (error) {
				return missingEntity(error, reply);
			}
		}
	);
	app.get('/fiscal/classifications', { preHandler: requireManager }, async () =>
		prisma.fiscalClassification.findMany({
			include: { operations: { orderBy: { code: 'asc' } } },
			orderBy: { name: 'asc' },
		})
	);

	app.post<{
		Body: {
			name: string;
			ncm: string;
			detail: string;
			operations: { code: string; label: string }[];
		};
	}>(
		'/fiscal/classifications',
		{
			preHandler: requireManager,
			schema: {
				body: {
					type: 'object',
					additionalProperties: false,
					required: ['name', 'ncm', 'detail', 'operations'],
					properties: {
						name: { type: 'string', minLength: 1, maxLength: 120 },
						ncm: {
							type: 'string',
							pattern: '^(?:[0-9]{8}|[0-9]{4}\\.[0-9]{2}\\.[0-9]{2})$',
						},
						detail: { type: 'string', minLength: 1, maxLength: 2000 },
						operations: {
							type: 'array',
							minItems: 1,
							maxItems: 8,
							items: {
								type: 'object',
								additionalProperties: false,
								required: ['code', 'label'],
								properties: {
									code: {
										type: 'string',
										pattern: '^(?:[0-9]{4}|[0-9]\\.[0-9]{3})$',
									},
									label: { type: 'string', minLength: 1, maxLength: 120 },
								},
							},
						},
					},
				},
			},
		},
		async (request, reply) => {
			const body = request.body;
			const operations = body.operations.map(value => ({
				code: value.code.replaceAll('.', ''),
				label: value.label.trim(),
			}));
			if (
				!body.name.trim() ||
				!body.detail.trim() ||
				operations.some(value => !value.label) ||
				new Set(operations.map(value => value.code)).size !== operations.length
			)
				return reply.code(400).send({
					error: 'Preencha os dados fiscais e informe operações sem códigos repetidos.',
				});
			try {
				return reply.code(201).send(
					await prisma.fiscalClassification.create({
						data: {
							name: body.name.trim(),
							ncm: body.ncm.replaceAll('.', ''),
							detail: body.detail.trim(),
							operations: { create: operations },
						},
						include: { operations: { orderBy: { code: 'asc' } } },
					})
				);
			} catch (error) {
				if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002')
					return reply
						.code(409)
						.send({ error: 'Já existe uma opção fiscal com esse nome.' });
				throw error;
			}
		}
	);

	for (const kind of ['categories', 'products'] as const) {
		const path = '/fiscal/' + kind + '/:id';
		const params = {
			type: 'object',
			required: ['id'],
			properties: { id: { type: 'string', minLength: 1, maxLength: 100 } },
		};
		app.get<{ Params: { id: string } }>(
			path,
			{ preHandler: requireManager, schema: { params } },
			async (request, reply) => {
				if (kind === 'categories') {
					const row = await prisma.category.findUnique({
						where: { id: request.params.id },
						select: {
							fiscalData: true,
							fiscalOperationId: true,
							fiscalOperation: { include: operationInclude },
						},
					});
					return row ?? reply.code(404).send({ error: 'Categoria não encontrada.' });
				}
				const row = await prisma.product.findUnique({
					where: { id: request.params.id },
					select: {
						fiscalData: true,
						fiscalOperationId: true,
						fiscalOperation: { include: operationInclude },
						category: {
							select: {
								fiscalData: true,
								fiscalOperation: { include: operationInclude },
							},
						},
					},
				});
				return row ?? reply.code(404).send({ error: 'Produto não encontrado.' });
			}
		);
		app.put<{
			Params: { id: string };
			Body: { operationId: string | null; fiscalData?: FiscalItemSettings };
		}>(
			path,
			{ preHandler: requireManager, schema: { params, body: selection } },
			async (request, reply) => {
				const id = request.params.id;
				const operationId = request.body.operationId;
				if (
					operationId &&
					!(await prisma.fiscalOperation.findUnique({
						where: { id: operationId },
						select: { id: true },
					}))
				)
					return reply.code(400).send({ error: 'Operação fiscal não encontrada.' });
				try {
					await prisma.$transaction(async tx => {
						const row =
							kind === 'categories'
								? await tx.category.findUniqueOrThrow({
										where: { id },
										select: { fiscalData: true },
									})
								: await tx.product.findUniqueOrThrow({
										where: { id },
										select: { fiscalData: true },
									});
						const data = {
							fiscalOperationId: operationId,
							...(request.body.fiscalData
								? {
										fiscalData: mergeFiscalItemSettings(
											row.fiscalData,
											request.body.fiscalData
										),
									}
								: {}),
						};
						if (kind === 'categories')
							await tx.category.update({ where: { id }, data });
						else await tx.product.update({ where: { id }, data });
					});
					return { fiscalOperationId: operationId };
				} catch (error) {
					return missingEntity(error, reply);
				}
			}
		);
	}
}

function missingEntity(error: unknown, reply: FastifyReply) {
	if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025')
		return reply.code(404).send({ error: 'Cadastro não encontrado.' });
	throw error;
}

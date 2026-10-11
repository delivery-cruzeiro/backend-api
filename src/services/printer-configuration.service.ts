import {
	PrinterConnectionStatus,
	createPrinterConfigurationSchema,
	type CreatePrinterConfigurationDTO,
	type PrinterConfiguration,
	type SetPrinterAssignmentsDTO,
	type UpdatePrinterConfigurationDTO,
} from '@delivery-cruzeiro/types';
import {
	PrismaPrinterConfigurationRepository,
	type PrinterConfigurationRecord,
	type PrinterConfigurationRepository,
} from '../repositories/printer-configuration.repository.js';

export type PrinterConfigurationActor = { id: string; role: string };

export class PrinterConfigurationError extends Error {
	constructor(
		message: string,
		readonly statusCode: number
	) {
		super(message);
		this.name = 'PrinterConfigurationError';
	}
}

function serialize(record: PrinterConfigurationRecord): PrinterConfiguration {
	const { categories, subcategories, ...printer } = record;
	return {
		...printer,
		receiptSections: printer.receiptSections as PrinterConfiguration['receiptSections'],
		lastKnownStatus: printer.lastKnownStatus as PrinterConfiguration['lastKnownStatus'],
		transport: printer.transport as PrinterConfiguration['transport'],
		adapterId: printer.adapterId as PrinterConfiguration['adapterId'],
		encoding: printer.encoding as PrinterConfiguration['encoding'],
		windowsCapabilities:
			printer.windowsCapabilities as unknown as PrinterConfiguration['windowsCapabilities'],
		lastSeenAt: printer.lastSeenAt?.toISOString() ?? null,
		connectionStatus: printer.connectionStatus as PrinterConnectionStatus,
		categoryIds: categories.map(item => item.categoryId),
		subcategoryIds: subcategories.map(item => item.subcategoryId),
	};
}

export class PrinterConfigurationService {
	constructor(
		private readonly repository: PrinterConfigurationRepository = new PrismaPrinterConfigurationRepository()
	) {}

	async list(storeId: string, actor: PrinterConfigurationActor) {
		await this.ensureStoreAccess(storeId, actor);
		return (await this.repository.list(storeId)).map(serialize);
	}

	async create(data: CreatePrinterConfigurationDTO, actor: PrinterConfigurationActor) {
		await this.ensureStoreAccess(data.storeId, actor);
		try {
			const isPrimary = (await this.repository.countByStore(data.storeId)) === 0;
			return serialize(await this.repository.create(data, isPrimary));
		} catch (error) {
			this.throwKnownError(error);
		}
	}

	async update(
		id: string,
		data: UpdatePrinterConfigurationDTO,
		actor: PrinterConfigurationActor
	) {
		const current = await this.findAccessible(id, actor);
		const validation = createPrinterConfigurationSchema.safeParse({
			...current,
			...data,
			lastSeenAt: data.lastSeenAt ?? current.lastSeenAt?.toISOString() ?? null,
		});
		if (!validation.success)
			throw new PrinterConfigurationError(
				'Configuração incompatível com o transporte ou protocolo da impressora',
				400
			);
		try {
			if (data.isPrimary) {
				const primary = await this.repository.setPrimary(id, current.storeId);
				if (Object.keys(data).some(key => key !== 'isPrimary')) {
					return serialize(await this.repository.update(id, data));
				}
				return serialize(primary);
			}
			if (data.isPrimary === false && current.isPrimary) {
				throw new PrinterConfigurationError(
					'Defina outra impressora como principal antes desta alteracao',
					400
				);
			}
			return serialize(await this.repository.update(id, data));
		} catch (error) {
			this.throwKnownError(error);
		}
	}

	async setAssignments(
		id: string,
		data: SetPrinterAssignmentsDTO,
		actor: PrinterConfigurationActor
	) {
		const current = await this.findAccessible(id, actor);
		if (
			!(await this.repository.validateAssignments(
				current.storeId,
				data.categoryIds,
				data.subcategoryIds
			))
		) {
			throw new PrinterConfigurationError('Uma ou mais categorias nao pertencem a loja', 400);
		}
		return serialize(await this.repository.setAssignments(id, data));
	}

	async delete(id: string, actor: PrinterConfigurationActor) {
		await this.findAccessible(id, actor);
		await this.repository.delete(id);
	}

	private async findAccessible(id: string, actor: PrinterConfigurationActor) {
		const printer = await this.repository.findById(id);
		if (!printer) throw new PrinterConfigurationError('Impressora nao encontrada', 404);
		await this.ensureStoreAccess(printer.storeId, actor);
		return printer;
	}

	private async ensureStoreAccess(storeId: string, actor: PrinterConfigurationActor) {
		if (!(await this.repository.hasStoreAccess(actor.id, actor.role, storeId))) {
			throw new PrinterConfigurationError('Loja nao encontrada ou sem permissao', 404);
		}
	}

	private throwKnownError(error: unknown): never {
		if (error instanceof PrinterConfigurationError) throw error;
		if (typeof error === 'object' && error && 'code' in error && error.code === 'P2002') {
			throw new PrinterConfigurationError(
				'Ja existe uma impressora com este nome ou conexao',
				409
			);
		}
		throw error;
	}
}

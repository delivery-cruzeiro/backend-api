import type { FastifyRequest } from 'fastify';

export type MultipartRequest = FastifyRequest & {
	isMultipart(): boolean;
	parts(): AsyncIterable<
		| {
				fieldname: string;
				filename: string;
				mimetype: string;
				toBuffer(): Promise<Buffer>;
				type: 'file';
		  }
		| {
				fieldname: string;
				type: 'field';
				value: unknown;
		  }
	>;
};

export type CatalogImageFile = {
	buffer: Buffer;
	filename: string;
	mimetype: string;
};

export function parseBooleanField(value: unknown) {
	if (typeof value === 'boolean') {
		return value;
	}

	if (typeof value !== 'string') {
		return undefined;
	}

	return value === 'true' || value === 'on' || value === '1';
}

export function parseNumberField(value: unknown) {
	if (typeof value === 'number') {
		return value;
	}

	if (typeof value !== 'string' || value.trim() === '') {
		return undefined;
	}

	return Number(value);
}

export function parseStringArrayField(value: unknown): string[] | undefined {
	if (Array.isArray(value)) {
		return value
			.flatMap(item => parseStringArrayField(item) ?? [])
			.filter((item, index, items) => items.indexOf(item) === index);
	}

	if (typeof value !== 'string') {
		return undefined;
	}

	const trimmedValue = value.trim();

	if (!trimmedValue) {
		return [];
	}

	try {
		const parsed = JSON.parse(trimmedValue) as unknown;

		if (Array.isArray(parsed)) {
			return parsed.filter((item): item is string => typeof item === 'string');
		}
	} catch {
		// Fall back to comma-separated form values.
	}

	return trimmedValue
		.split(',')
		.map(item => item.trim())
		.filter(Boolean);
}

export function appendMultipartField(fields: Record<string, unknown>, key: string, value: unknown) {
	const currentValue = fields[key];

	if (currentValue === undefined) {
		fields[key] = value;
		return;
	}

	fields[key] = Array.isArray(currentValue) ? [...currentValue, value] : [currentValue, value];
}

export function normalizeBaseCatalogInput(fields: Record<string, unknown>) {
	return {
		...(typeof fields.description === 'string' &&
			fields.description.trim() && { description: fields.description }),
		...(typeof fields.imageUrl === 'string' &&
			fields.imageUrl.trim() && { imageUrl: fields.imageUrl }),
		...(fields.isActive !== undefined && { isActive: parseBooleanField(fields.isActive) }),
		...(fields.name !== undefined && { name: fields.name }),
		...(fields.order !== undefined && { order: parseNumberField(fields.order) }),
		...(fields.storeIds !== undefined && {
			storeIds: parseStringArrayField(fields.storeIds),
		}),
	};
}

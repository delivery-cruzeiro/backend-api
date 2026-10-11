import {
	ProductAdditionalFieldSource,
	productAdditionalFieldSchema,
	type EffectiveProductAdditionalFieldDTO,
	type ProductAdditionalFieldDTO,
} from '@delivery-cruzeiro/types';

type AdditionalFieldOwner = {
	additionalFields: unknown;
	id: string;
};

function validUniqueFields(value: unknown): ProductAdditionalFieldDTO[] {
	if (!Array.isArray(value)) return [];

	const fields = new Map<string, ProductAdditionalFieldDTO>();
	for (const candidate of value) {
		const parsed = productAdditionalFieldSchema.safeParse(candidate);
		if (parsed.success && !fields.has(parsed.data.id)) fields.set(parsed.data.id, parsed.data);
	}

	return [...fields.values()];
}

function withOrigin(
	owner: AdditionalFieldOwner | null | undefined,
	source: ProductAdditionalFieldSource
): EffectiveProductAdditionalFieldDTO[] {
	if (!owner) return [];

	return validUniqueFields(owner.additionalFields).map(field => ({
		...field,
		definitionId: field.id,
		id:
			source === ProductAdditionalFieldSource.PRODUCT
				? field.id
				: `${source.toLowerCase()}:${owner.id}:${encodeURIComponent(field.id)}`,
		source,
		sourceId: owner.id,
	}));
}

export function composeProductAdditionalFields(input: {
	category?: AdditionalFieldOwner | null;
	product: AdditionalFieldOwner;
	subcategory?: AdditionalFieldOwner | null;
}): EffectiveProductAdditionalFieldDTO[] {
	return [
		...withOrigin(input.product, ProductAdditionalFieldSource.PRODUCT),
		...withOrigin(input.category, ProductAdditionalFieldSource.CATEGORY),
		...withOrigin(input.subcategory, ProductAdditionalFieldSource.SUBCATEGORY),
	];
}

import { ProductAdditionalFieldSource, ProductAdditionalFieldType } from '@delivery-cruzeiro/types';
import { describe, expect, it } from 'vitest';
import { composeProductAdditionalFields } from './product-additional-fields.service.js';

const field = (id: string, label: string) => ({
	id,
	label,
	options: [],
	type: ProductAdditionalFieldType.TEXT,
});

describe('composeProductAdditionalFields', () => {
	it('keeps product fields first, appends inherited fields and namespaces equal ids', () => {
		const result = composeProductAdditionalFields({
			category: { additionalFields: [field('same', 'Categoria')], id: 'cat-1' },
			product: { additionalFields: [field('same', 'Produto')], id: 'prod-1' },
			subcategory: { additionalFields: [field('same', 'Subcategoria')], id: 'sub-1' },
		});

		expect(result.map(item => item.label)).toEqual(['Produto', 'Categoria', 'Subcategoria']);
		expect(new Set(result.map(item => item.id)).size).toBe(3);
		expect(result[1]).toMatchObject({
			definitionId: 'same',
			source: ProductAdditionalFieldSource.CATEGORY,
			sourceId: 'cat-1',
		});
	});

	it('reflects removal at the owner and ignores duplicate definitions within one owner', () => {
		const category = { additionalFields: [field('one', 'Um'), field('one', 'Duplicado')], id: 'cat-1' };
		expect(composeProductAdditionalFields({ category, product: { additionalFields: [], id: 'prod-1' } })).toHaveLength(1);
		category.additionalFields = [];
		expect(composeProductAdditionalFields({ category, product: { additionalFields: [], id: 'prod-1' } })).toEqual([]);
	});
});

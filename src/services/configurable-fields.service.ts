import { ProductAdditionalFieldType, productAdditionalFieldSchema, type ProductAdditionalFieldDTO, type ProductAdditionalFieldValueDTO } from '@delivery-cruzeiro/types';

function formatAdditionalValue(value: number) {
	return value.toLocaleString('pt-BR', { currency: 'BRL', style: 'currency' });
}

export function resolveAdditionalFields(
	configuredFieldsValue: unknown,
	selectedValues: ProductAdditionalFieldValueDTO[] = []
): { error: string; success: false } | { additionalValue: number; notes: string; values: ProductAdditionalFieldValueDTO[]; success: true } {
	const configuredFieldsInput = configuredFieldsValue ?? [];
	if (!Array.isArray(configuredFieldsInput)) {
		return {
			error: 'Configuracao de campos adicionais do produto invalida',
			success: false,
		};
	}

	const configuredFieldsList: ProductAdditionalFieldDTO[] = [];
	for (const configuredFieldValue of configuredFieldsInput) {
		const configuredField = productAdditionalFieldSchema.safeParse(configuredFieldValue);
		if (!configuredField.success) {
			return {
				error: 'Configuracao de campos adicionais do produto invalida',
				success: false,
			};
		}
		configuredFieldsList.push(configuredField.data);
	}

	const configuredFields = new Map(configuredFieldsList.map(field => [field.id, field]));
	const selectedIds = new Set<string>();
	const normalizedValues: ProductAdditionalFieldValueDTO[] = [];

	for (const selectedValue of selectedValues) {
		if (selectedIds.has(selectedValue.fieldId)) {
			return { error: 'Campo adicional duplicado no produto', success: false };
		}

		selectedIds.add(selectedValue.fieldId);
		const configuredField = configuredFields.get(selectedValue.fieldId);

		if (!configuredField || configuredField.type !== selectedValue.type) {
			return { error: 'Campo adicional do produto nao encontrado', success: false };
		}

		const value = selectedValue.value;
		const isValidValue =
			configuredField.type === ProductAdditionalFieldType.CHECKBOX
				? value === true
				: typeof value === 'string' &&
					value.trim().length > 0 &&
					(configuredField.type === ProductAdditionalFieldType.TEXT ||
						configuredField.options.includes(value));

		if (!isValidValue) {
			return { error: 'Valor de campo adicional do produto invalido', success: false };
		}

		normalizedValues.push({
			additionalValue: configuredField.additionalValue,
			fieldId: configuredField.id,
			label: configuredField.label,
			type: configuredField.type,
			value,
		});
	}

	const additionalValue = normalizedValues.reduce(
		(total, field) => total + Number(field.additionalValue ?? 0),
		0
	);
	const notes = normalizedValues
		.map(field => {
			const displayedValue =
				field.type === ProductAdditionalFieldType.CHECKBOX
					? field.label
					: `${field.label}: ${field.value}`;
			const price = Number(field.additionalValue ?? 0);
			return price > 0
				? `${displayedValue} (+${formatAdditionalValue(price)})`
				: displayedValue;
		})
		.join('\n');

	return { additionalValue: Math.round(additionalValue * 100) / 100, notes, values: normalizedValues, success: true };
}


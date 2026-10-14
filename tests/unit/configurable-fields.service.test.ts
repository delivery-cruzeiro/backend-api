import { describe, expect, it } from 'vitest';
import { ProductAdditionalFieldType } from '@delivery-cruzeiro/types';
import { resolveAdditionalFields } from '../../src/services/configurable-fields.service.js';

const field = { id: 'installments', label: 'Parcelamento', type: ProductAdditionalFieldType.COMBOBOX, options: ['2 vezes', '3 vezes'], additionalValue: 2.75 };
const selected = { fieldId: field.id, label: 'rótulo adulterado', type: field.type, value: '2 vezes', additionalValue: 0 };

describe('campos configuráveis do pagamento', () => {
 it('calcula pelo cadastro e salva o rótulo e preço corretos', () => {
  const result = resolveAdditionalFields([field], [selected]);
  expect(result).toMatchObject({ success: true, additionalValue: 2.75, values: [{ ...selected, label: field.label, additionalValue: 2.75 }] });
 });
 it('não cobra campo sem preenchimento', () => {
  expect(resolveAdditionalFields([field], [])).toMatchObject({ success: true, additionalValue: 0, values: [] });
 });
 it.each([
  [{ ...selected, fieldId: 'inexistente' }],
  [selected, selected],
  [{ ...selected, value: '99 vezes' }],
  [{ ...selected, type: ProductAdditionalFieldType.TEXT }],
 ])('rejeita valores desconhecidos, duplicados ou incompatíveis', (...values) => {
  expect(resolveAdditionalFields([field], values).success).toBe(false);
 });
});

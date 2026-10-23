import { describe, expect, it } from 'vitest';
import { ProductAdditionalFieldType } from '@delivery-cruzeiro/types';
import { resolveAdditionalFields } from '../../src/services/configurable-fields.service.js';

const field = { id: 'installments', label: 'Parcelamento', type: ProductAdditionalFieldType.COMBOBOX, options: ['2 vezes', '3 vezes'], additionalValue: 2.75 };
const selected = { fieldId: field.id, label: 'rótulo adulterado', type: field.type, value: '2 vezes', additionalValue: 0 };

describe('campos configuráveis do pagamento', () => {
 it('valida campos obrigatórios omitidos, inclusive herdados', () => {
  expect(resolveAdditionalFields([{ ...field, required: true }], []).success).toBe(false);
 });
 it('calcula as opções no servidor sem aceitar preços e rótulos enviados pelo cliente', () => {
  const list = { id: 'list', label: 'Lista', type: ProductAdditionalFieldType.MULTI_OPTION, options: [], required: true, maxQuantity: 5, quantityOptions: [{ id: 'a', label: 'Batata', additionalValue: 1.25, maxQuantity: 3 }] };
  const result = resolveAdditionalFields([list], [{ fieldId: 'list', label: 'fake', type: list.type, value: [{ optionId: 'a', label: 'fake', quantity: 2 }], additionalValue: 0 }]);
  expect(result).toMatchObject({ success: true, additionalValue: 2.5, notes: 'Lista: Batata × 2 (+R$ 2,50)', values: [{ label: 'Lista', additionalValue: 2.5, value: [{ optionId: 'a', label: 'Batata', quantity: 2 }] }] });
 });
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

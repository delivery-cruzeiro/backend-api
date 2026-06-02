import type {
	FiscalAccessKeyInput,
	FiscalAccessKeyParts,
	FiscalDocumentModel,
	FiscalEmissionType,
	FiscalIdentity,
} from '../types/fiscal-id.types.js';
import { FiscalCheckDigitService } from './fiscal-check-digit.service.js';

const STATE_CODE_LENGTH = 2;
const MONTH_YEAR_LENGTH = 4;
const CNPJ_LENGTH = 14;
const FISCAL_MODEL_LENGTH = 2;
const SERIE_LENGTH = 3;
const FISCAL_NUMBER_LENGTH = 9;
const EMISSION_TYPE_LENGTH = 1;
const NUMERIC_CODE_LENGTH = 8;
const ACCESS_KEY_WITHOUT_DIGIT_LENGTH = 43;
const ACCESS_KEY_LENGTH = 44;

export class FiscalAccessKeyBuilderService {
	constructor(private readonly checkDigitService = new FiscalCheckDigitService()) {}

	validateBaseInput(input: Omit<FiscalAccessKeyInput, 'invoiceNumber' | 'orderNumber'>) {
		assertFixedDigits('Codigo UF', input.stateCode, STATE_CODE_LENGTH);
		formatMonthYear(input.issueDate);
		assertFixedDigits('CNPJ do emissor', input.issuerCnpj, CNPJ_LENGTH);
		assertFixedDigits('Modelo fiscal', input.model, FISCAL_MODEL_LENGTH);
		formatPositiveInteger('Serie fiscal', input.serie, SERIE_LENGTH);
		assertFixedDigits('Tipo de emissao', input.emissionType, EMISSION_TYPE_LENGTH);
	}

	build(input: FiscalAccessKeyInput): FiscalIdentity {
		const parts = this.buildParts(input);
		const accessKey = `${parts.partialKey}${parts.checkDigit}`;

		if (accessKey.length !== ACCESS_KEY_LENGTH) {
			throw new Error('A chave fiscal deve conter exatamente 44 digitos');
		}

		return {
			accessKey,
			checkDigit: parts.checkDigit,
			emissionType: input.emissionType,
			fiscalId: `NFe${accessKey}`,
			fiscalNumber: parts.fiscalNumber,
			model: input.model,
			numericCode: parts.numericCode,
			serie: parts.serie,
		};
	}

	private buildParts(input: FiscalAccessKeyInput): FiscalAccessKeyParts {
		const stateCode = assertFixedDigits('Codigo UF', input.stateCode, STATE_CODE_LENGTH);
		const monthYear = formatMonthYear(input.issueDate);
		const issuerCnpj = assertFixedDigits('CNPJ do emissor', input.issuerCnpj, CNPJ_LENGTH);
		const model = assertFixedDigits('Modelo fiscal', input.model, FISCAL_MODEL_LENGTH);
		const serie = formatPositiveInteger('Serie fiscal', input.serie, SERIE_LENGTH);
		const fiscalNumber = formatPositiveInteger(
			'Numero fiscal',
			input.invoiceNumber,
			FISCAL_NUMBER_LENGTH
		);
		const emissionType = assertFixedDigits(
			'Tipo de emissao',
			input.emissionType,
			EMISSION_TYPE_LENGTH
		);
		const numericCode = formatOrderNumericCode(input.orderNumber);
		const partialKey = `${stateCode}${monthYear}${issuerCnpj}${model}${serie}${fiscalNumber}${emissionType}${numericCode}`;

		if (partialKey.length !== ACCESS_KEY_WITHOUT_DIGIT_LENGTH) {
			throw new Error('A chave parcial fiscal deve conter exatamente 43 digitos');
		}

		return {
			checkDigit: this.checkDigitService.calculate(partialKey),
			fiscalNumber,
			monthYear,
			numericCode,
			partialKey,
			serie,
		};
	}
}

function formatMonthYear(date: Date) {
	if (Number.isNaN(date.getTime())) {
		throw new Error('Data de emissao fiscal invalida');
	}

	const year = String(date.getFullYear()).slice(-2);
	const month = String(date.getMonth() + 1).padStart(2, '0');

	return assertFixedDigits('AAMM', `${year}${month}`, MONTH_YEAR_LENGTH);
}

function assertFixedDigits(fieldName: string, value: string, length: number) {
	const digits = value.replace(/\D/g, '');

	if (digits.length !== length) {
		throw new Error(`${fieldName} deve conter exatamente ${length} digitos`);
	}

	return digits;
}

function formatPositiveInteger(fieldName: string, value: number | string, length: number) {
	const digits =
		typeof value === 'number' ? assertPositiveInteger(fieldName, value) : digitsOnly(value);

	if (digits.length > length) {
		throw new Error(`${fieldName} deve conter no maximo ${length} digitos`);
	}

	return digits.padStart(length, '0');
}

function assertPositiveInteger(fieldName: string, value: number) {
	if (!Number.isInteger(value) || value <= 0) {
		throw new Error(`${fieldName} deve ser um inteiro positivo`);
	}

	return String(value);
}

function digitsOnly(value: string) {
	const digits = value.replace(/\D/g, '');

	if (!digits) {
		throw new Error('Valor numerico fiscal obrigatorio');
	}

	return digits;
}

function formatOrderNumericCode(orderNumber: number) {
	const digits = assertPositiveInteger('Numero interno do pedido', orderNumber);

	return digits.slice(-NUMERIC_CODE_LENGTH).padStart(NUMERIC_CODE_LENGTH, '0');
}

export type { FiscalDocumentModel, FiscalEmissionType };

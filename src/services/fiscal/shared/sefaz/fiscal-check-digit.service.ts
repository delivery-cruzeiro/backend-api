const ACCESS_KEY_WITHOUT_DIGIT_LENGTH = 43;

export class FiscalCheckDigitService {
	calculate(accessKeyWithoutDigit: string) {
		if (!new RegExp(`^\\d{${ACCESS_KEY_WITHOUT_DIGIT_LENGTH}}$`).test(accessKeyWithoutDigit)) {
			throw new Error('A chave parcial fiscal deve conter exatamente 43 digitos');
		}

		let weight = 2;
		let sum = 0;

		for (let index = accessKeyWithoutDigit.length - 1; index >= 0; index -= 1) {
			sum += Number(accessKeyWithoutDigit[index]) * weight;
			weight = weight === 9 ? 2 : weight + 1;
		}

		const digit = 11 - (sum % 11);

		return digit === 10 || digit === 11 ? '0' : String(digit);
	}
}

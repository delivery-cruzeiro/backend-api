import type { DanfeNfceData } from './danfe-nfce.types.js';

const COLUMNS = 48;

export class EscPosBuilderService {
	private readonly encoder = new TextEncoder();

	execute(data: DanfeNfceData) {
		const parts: Uint8Array[] = [
			bytes([0x1b, 0x40]),
			align('center'),
			bold(true),
			this.line(data.emit.tradeName ?? data.emit.name),
			bold(false),
			this.line(data.emit.name),
			this.line(`CNPJ ${formatCnpj(data.emit.cnpj)}`),
			...(data.emit.ie ? [this.line(`IE ${data.emit.ie}`)] : []),
			this.line(`${data.emit.street}, ${data.emit.number}`),
			this.line(`${data.emit.neighborhood} - ${data.emit.city}/${data.emit.state}`),
			this.separator(),
			bold(true),
			this.line('DANFE NFC-e'),
			bold(false),
			this.line('Documento Auxiliar da Nota Fiscal de Consumidor Eletronica'),
			...(data.contingency
				? [bold(true), this.line('EMITIDA EM CONTINGENCIA'), bold(false)]
				: []),
			this.separator(),
			align('left'),
			this.line(`NFC-e ${data.fiscalNumber} Serie ${data.serie}`),
			this.line(`Emissao ${formatDate(data.issuedAt)}`),
			this.line(`Modelo ${data.model} Ambiente ${environmentLabel(data.environment)}`),
			this.separator(),
			this.line('Produtos'),
			...data.products.flatMap(product => [
				this.line(product.name),
				this.line(
					`${formatNumber(product.quantity)} x ${formatMoney(product.unitValue)}`.padEnd(
						30
					) + formatMoney(product.total).padStart(18)
				),
			]),
			this.separator(),
			bold(true),
			this.line(`TOTAL`.padEnd(30) + formatMoney(data.total).padStart(18)),
			bold(false),
			...data.payments.map(payment =>
				this.line(payment.type.padEnd(30) + formatMoney(payment.amount).padStart(18))
			),
			this.separator(),
			this.line('Chave de acesso'),
			this.line(formatAccessKey(data.accessKey)),
			...(data.protocol ? [this.line(`Protocolo ${data.protocol}`)] : []),
			...(data.authorizationDate
				? [this.line(`Autorizacao ${formatDate(data.authorizationDate)}`)]
				: []),
			align('center'),
			this.qrCode(data.qrCodeUrl),
			this.line('Consulte pela chave de acesso ou QRCode'),
			this.feed(4),
			bytes([0x1d, 0x56, 0x00]),
		];

		return concat(parts);
	}

	private line(value: string) {
		return concat([this.encoder.encode(normalizeLine(value).slice(0, COLUMNS)), this.feed()]);
	}

	private separator() {
		return this.line('-'.repeat(COLUMNS));
	}

	private feed(count = 1) {
		return bytes(Array.from({ length: count }, () => 0x0a));
	}

	private qrCode(value: string) {
		const data = this.encoder.encode(value);
		const storeLength = data.length + 3;
		const storeData = bytes([
			0x1d,
			0x28,
			0x6b,
			storeLength % 256,
			Math.floor(storeLength / 256),
			0x31,
			0x50,
			0x30,
			...data,
		]);

		return concat([
			bytes([0x1d, 0x28, 0x6b, 0x04, 0x00, 0x31, 0x41, 0x32, 0x00]),
			bytes([0x1d, 0x28, 0x6b, 0x03, 0x00, 0x31, 0x43, 0x06]),
			bytes([0x1d, 0x28, 0x6b, 0x03, 0x00, 0x31, 0x45, 0x30]),
			storeData,
			bytes([0x1d, 0x28, 0x6b, 0x03, 0x00, 0x31, 0x51, 0x30]),
			this.feed(),
		]);
	}
}

function bytes(value: number[]) {
	return new Uint8Array(value);
}

function concat(parts: Uint8Array[]) {
	const output = new Uint8Array(parts.reduce((total, part) => total + part.length, 0));
	let offset = 0;

	parts.forEach(part => {
		output.set(part, offset);
		offset += part.length;
	});

	return output;
}

function align(value: 'center' | 'left') {
	return bytes([0x1b, 0x61, value === 'center' ? 1 : 0]);
}

function bold(enabled: boolean) {
	return bytes([0x1b, 0x45, enabled ? 1 : 0]);
}

function normalizeLine(value: string) {
	return value
		.normalize('NFD')
		.replace(/\p{Diacritic}/gu, '')
		.replace(/[^\x20-\x7E]/g, '');
}

function formatAccessKey(value: string) {
	return value.replace(/(\d{4})(?=\d)/g, '$1 ').trim();
}

function formatCnpj(value: string) {
	return value.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5');
}

function formatDate(value: string) {
	if (!value) {
		return '';
	}

	const date = new Date(value);

	if (Number.isNaN(date.getTime())) {
		return value;
	}

	return new Intl.DateTimeFormat('pt-BR', {
		dateStyle: 'short',
		timeStyle: 'short',
		timeZone: 'America/Sao_Paulo',
	}).format(date);
}

function formatMoney(value: string) {
	return Number(value || 0).toLocaleString('pt-BR', {
		currency: 'BRL',
		minimumFractionDigits: 2,
		style: 'currency',
	});
}

function formatNumber(value: string) {
	return Number(value || 0).toLocaleString('pt-BR', {
		maximumFractionDigits: 4,
		minimumFractionDigits: 0,
	});
}

function environmentLabel(value: string) {
	return value === '1' ? 'Producao' : 'Homologacao';
}

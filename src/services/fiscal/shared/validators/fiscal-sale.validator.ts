import type { FiscalSaleRecord } from '../../../../repositories/sales.repository.js';
import { getFiscalCityCode } from '../fiscal-location-codes.js';
import type {
	FiscalAddress,
	FiscalEnvironment,
	FiscalSaleSnapshot,
} from '../types/fiscal-emission.types.js';

export class FiscalInputError extends Error {}

export function prepareFiscalSale(sale: FiscalSaleRecord, environment: FiscalEnvironment) {
	const store = sale.store;
	const profile = object(store?.fiscalProfile);
	const setup = object(profile[environment === '1' ? 'production' : 'homologation']);
	const cnpj = fiscalId(store?.cnpj);
	const ie = field(profile, 'ie');
	const crt = field(profile, 'crt');
	if (
		!store ||
		store.address.state !== 'PB' ||
		cnpj.length !== 14 ||
		!/^\d{9}$/.test(ie) ||
		crt !== '1' ||
		setup.enabled !== true
	) {
		throw new FiscalInputError(
			'Configure e habilite o perfil fiscal do emitente da Paraíba neste ambiente.'
		);
	}
	if (!['CONFIRMED', 'PREPARING', 'ON_THE_WAY', 'DELIVERED'].includes(sale.status)) {
		throw new FiscalInputError('O pedido precisa estar confirmado e não pode estar cancelado.');
	}

	const customer = object(sale.fiscalRecipient);
	const total = cents(sale.total);
	const delivery = sale.address !== null;
	const declaredId = fiscalId(field(customer, 'id'));
	const model = declaredId.length === 14 || setup.retailModel === '55' ? '55' : '65';
	const recipientId =
		declaredId ||
		(delivery || model === '55' || total >= 50000 ? fiscalId(sale.user?.cpf) : '');
	const environmentName = environment === '1' ? 'produção' : 'homologação';
	if (setup[model === '55' ? 'enable55' : 'enable65'] !== true) {
		throw new FiscalInputError(
			`O modelo ${model === '65' ? 'NFC-e (65)' : 'NF-e (55)'} não está habilitado em ${environmentName} para esta loja.`
		);
	}
	if (delivery && setup.allowDelivery !== true) {
		throw new FiscalInputError(
			`Este pedido é de entrega, mas a emissão com entrega está desabilitada em ${environmentName} para esta loja. ${
				environment === '2'
					? 'Ative a opção de entrega em Configurações do sistema → Informações avançadas.'
					: 'Revise o perfil fiscal de produção da loja.'
			}`
		);
	}
	const series = field(setup, model === '55' ? 'serie55' : 'serie65');
	const last = setup[model === '55' ? 'lastNumber55' : 'lastNumber65'];
	if (
		!/^\d{1,3}$/.test(series) ||
		typeof last !== 'number' ||
		!Number.isInteger(last) ||
		last < 0 ||
		last >= 999999999
	) {
		throw new FiscalInputError(
			'Configure a série e o último número conciliado para o modelo fiscal.'
		);
	}
	if ((delivery || model === '55' || total >= 50000) && !recipientId) {
		throw new FiscalInputError(
			delivery
				? 'Este pedido é de entrega. Informe o CPF/CNPJ do destinatário para emitir a nota fiscal.'
				: 'Informe a identificação fiscal do destinatário.'
		);
	}
	const addressSource = sale.address ?? (model === '55' ? object(customer.address) : undefined);
	const recipientAddress = addressSource
		? address(addressSource, field(customer, 'cityCode'))
		: undefined;
	if ((model === '55' || delivery) && (!recipientAddress || recipientAddress.state !== 'PB')) {
		throw new FiscalInputError(
			'Informe um endereço fiscal completo na PB para o destinatário.'
		);
	}
	const recipientName = field(customer, 'name') || sale.user?.name;
	if (recipientId && !recipientName)
		throw new FiscalInputError('Informe o nome fiscal do destinatário.');
	const issuerAddress = address(store.address, field(profile, 'cityCode'));
	const recipientIe = field(customer, 'ie');
	const taxIndicator = field(customer, 'taxIndicator') || (recipientId.length === 14 ? '' : '9');
	const finalConsumer = recipientId.length === 14 ? customer.finalConsumer : true;
	if (
		(taxIndicator !== '1' && taxIndicator !== '2' && taxIndicator !== '9') ||
		(model === '65' && taxIndicator !== '9') ||
		typeof finalConsumer !== 'boolean' ||
		(taxIndicator === '1' ? !recipientIe : Boolean(recipientIe))
	) {
		throw new FiscalInputError(
			'Informe o enquadramento do destinatário e a inscrição estadual quando exigida.'
		);
	}
	if (!issuerAddress || (recipientIe && !/^\d{9}$/.test(recipientIe))) {
		throw new FiscalInputError('Revise o endereço do emitente e a IE do destinatário.');
	}

	const kind = sale.storePaymentMethod?.type ?? sale.paymentType ?? sale.paymentMethod?.type;
	const payment =
		kind === 'CASH' && !sale.payments.length
			? '01'
			: kind === 'PIX' && setup.staticPix === true && !sale.payments.length
				? '20'
				: null;
	if (!payment || cents(sale.paymentAdditionalValue) !== 0) {
		throw new FiscalInputError(
			'Forma de pagamento ou adicional ainda sem configuração fiscal compatível.'
		);
	}

	const subtotal = cents(sale.subtotal);
	const freight = cents(sale.deliveryFee);
	const discount = cents(sale.discount);
	const lines = sale.items.map(item => cents(item.price) * item.quantity);
	if (
		!sale.items.length ||
		total <= 0 ||
		subtotal <= 0 ||
		freight < 0 ||
		discount < 0 ||
		lines.some(line => !Number.isSafeInteger(line) || line <= 0) ||
		subtotal !== lines.reduce((a, b) => a + b, 0) ||
		total !== subtotal + freight - discount
	) {
		throw new FiscalInputError('Itens, frete, desconto e total da venda não conferem.');
	}
	const freightLines = allocate(freight, lines, subtotal);
	const discountLines = allocate(discount, lines, subtotal);
	const items = sale.items.map((item, index) => {
		const productData = fiscalFields(item.product.fiscalData, model);
		const categoryData = fiscalFields(item.product.category?.fiscalData, model);
		const data = Object.fromEntries(
			['ncm', 'cfop', 'unit', 'origin', 'gtin', 'csosn', 'pisCst', 'cofinsCst'].map(key => [
				key,
				field(productData, key) ||
					field(categoryData, key) ||
					(['csosn', 'pisCst', 'cofinsCst'].includes(key)
						? field(object(profile.taxDefaults), key)
						: ''),
			])
		);
		const selected = item.product.fiscalOperation ?? item.product.category?.fiscalOperation;
		const ncm = selected?.classification.ncm ?? data.ncm;
		const cfop = selected?.code ?? data.cfop;
		const { unit, origin, gtin } = data;
		if (
			typeof ncm !== 'string' ||
			!/^\d{8}$/.test(ncm) ||
			ncm === '00000000' ||
			typeof cfop !== 'string' ||
			!/^5\d{3}$/.test(cfop) ||
			typeof unit !== 'string' ||
			!/^[A-Z0-9]{1,6}$/.test(unit) ||
			typeof origin !== 'string' ||
			!/^[0-8]$/.test(origin) ||
			typeof gtin !== 'string' ||
			!/^(SEM GTIN|\d{8}|\d{12,14})$/.test(gtin) ||
			!['102', '500'].includes(data.csosn) ||
			data.pisCst !== '99' ||
			data.cofinsCst !== '99' ||
			(cfop === '5405' && data.csosn !== '500') ||
			(cfop !== '5405' && data.csosn === '500') ||
			discountLines[index] > lines[index]
		) {
			throw new FiscalInputError(
				`Revise a classificação fiscal de ${item.product.name} para o modelo ${model}.`
			);
		}
		return {
			code: item.productId,
			name: item.product.name,
			ncm,
			cfop,
			unit,
			origin,
			gtin,
			csosn: data.csosn as '102' | '500',
			pisCst: data.pisCst as '99',
			cofinsCst: data.cofinsCst as '99',
			quantity: item.quantity,
			price: cents(item.price),
			freight: freightLines[index],
			discount: discountLines[index],
		};
	});
	const snapshot: FiscalSaleSnapshot = {
		issuer: {
			cnpj,
			ie,
			crt,
			name: store.name,
			tradeName: store.nickname,
			address: issuerAddress,
		},
		recipient: recipientId
			? {
					id: recipientId,
					name: recipientName!,
					taxIndicator,
					ie: recipientIe || undefined,
					address: recipientAddress,
				}
			: undefined,
		items,
		total,
		payment,
		delivery,
		finalConsumer,
		orderNumber: sale.orderNumber,
	};
	return {
		model: model as '55' | '65',
		serie: series.padStart(3, '0'),
		lastNumber: last,
		snapshot,
	};
}

function fiscalFields(value: unknown, model: string) {
	const common = object(value);
	const data = { ...object(common[model]), ...common };
	const legacy = field(data, 'taxProfile');
	const mapped =
		legacy === 'SN102_PIS99_COFINS99'
			? '102'
			: legacy === 'SN500_PIS99_COFINS99'
				? '500'
				: legacy
					? 'UNSUPPORTED'
					: '';
	return {
		...data,
		csosn: 'csosn' in data ? data.csosn : mapped,
		pisCst: 'pisCst' in data ? data.pisCst : mapped ? '99' : '',
		cofinsCst: 'cofinsCst' in data ? data.cofinsCst : mapped ? '99' : '',
	};
}

function object(value: unknown): Record<string, unknown> {
	return value && typeof value === 'object' && !Array.isArray(value)
		? (value as Record<string, unknown>)
		: {};
}

function field(value: Record<string, unknown>, name: string) {
	return typeof value[name] === 'string' ? value[name].trim() : '';
}

function fiscalId(value: string | null | undefined) {
	const id = (value ?? '').replace(/[.\/\s-]/g, '');
	if (!id) return '';
	if (!/^(\d{11}|\d{14})$/.test(id))
		throw new FiscalInputError('CPF ou CNPJ fora dos formatos fiscais suportados.');
	if (/^(\d)\1+$/.test(id)) throw new FiscalInputError('CPF ou CNPJ fiscal inválido.');
	for (let size = id.length - 2; size < id.length; size++) {
		const sum = Array.from(id.slice(0, size))
			.reverse()
			.reduce(
				(total, digit, index) =>
					total + Number(digit) * (id.length === 11 ? index + 2 : (index % 8) + 2),
				0
			);
		const rest = sum % 11;
		if (Number(id[size]) !== (rest < 2 ? 0 : 11 - rest))
			throw new FiscalInputError('CPF ou CNPJ fiscal inválido.');
	}
	return id;
}

function address(value: unknown, cityCode: string): FiscalAddress | undefined {
	const data = object(value);
	const state = field(data, 'state');
	const city = field(data, 'city');
	const code = cityCode || getFiscalCityCode({ city, state });
	const street = field(data, 'street');
	const number = field(data, 'number');
	const neighborhood = field(data, 'neighborhood');
	const zipCode = field(data, 'zipCode').replace('-', '');
	if (
		state !== 'PB' ||
		!code ||
		!/^25\d{5}$/.test(code) ||
		!street ||
		!number ||
		!neighborhood ||
		!city ||
		!/^\d{8}$/.test(zipCode)
	)
		return;
	return {
		street,
		number,
		neighborhood,
		city,
		cityCode: code,
		state,
		zipCode,
		complement: field(data, 'complement'),
	};
}

function cents(value: unknown) {
	const match = /^(-?\d+)(?:\.(\d{1,2}))?$/.exec(String(value));
	if (!match) throw new FiscalInputError('Valor da venda inválido para emissão.');
	const amount =
		Number(match[1]) * 100 +
		Number((match[2] ?? '').padEnd(2, '0')) * (match[1].startsWith('-') ? -1 : 1);
	if (!Number.isSafeInteger(amount))
		throw new FiscalInputError('Valor da venda fora do limite fiscal.');
	return amount;
}

function allocate(total: number, lines: number[], subtotal: number) {
	let accumulated = 0n;
	let previous = 0;
	return lines.map(line => {
		accumulated += BigInt(line);
		const proportional = Number((BigInt(total) * accumulated) / BigInt(subtotal));
		const value = proportional - previous;
		previous = proportional;
		return value;
	});
}

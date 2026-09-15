import {
	OrderStatus,
	whatsappMessagePlaceholderKeys,
	type WhatsAppMessagePlaceholderKey,
	type WhatsAppMessageTemplateDTO,
} from '@delivery-cruzeiro/types';

export type WhatsAppTemplateOrderData = {
	address?: {
		city: string;
		complement?: string | null;
		neighborhood: string;
		number: string;
		state: string;
		street: string;
		zipCode: string;
	} | null;
	items: Array<{ name: string; quantity: number }>;
	paymentType?: string | null;
	orderNumber: number | null;
	phone: string;
	status: OrderStatus;
	storeName?: string | null;
	total: number;
	userName: string;
};

export type ResolvedWhatsAppMessagePart =
	| { type: 'text'; text: string }
	| { type: 'image'; url: string; caption?: string };

const placeholderSet = new Set<string>(whatsappMessagePlaceholderKeys);

const statusLabels: Record<OrderStatus, string> = {
	[OrderStatus.PENDING]: 'Pendente',
	[OrderStatus.CONFIRMED]: 'Confirmado',
	[OrderStatus.PREPARING]: 'Em preparação',
	[OrderStatus.ON_THE_WAY]: 'A caminho',
	[OrderStatus.DELIVERED]: 'Entregue',
	[OrderStatus.CANCELLED]: 'Cancelado',
};

function escapeHtmlAttribute(value: string) {
	return value
		.replaceAll('&', '&amp;')
		.replaceAll('"', '&quot;')
		.replaceAll('<', '&lt;')
		.replaceAll('>', '&gt;');
}

function decodeHtmlEntities(value: string) {
	return value
		.replace(/&#(\d+);/g, (_match, code: string) => String.fromCodePoint(Number(code)))
		.replace(/&#x([\da-f]+);/gi, (_match, code: string) =>
			String.fromCodePoint(Number.parseInt(code, 16))
		)
		.replaceAll('&nbsp;', ' ')
		.replaceAll('&lt;', '<')
		.replaceAll('&gt;', '>')
		.replaceAll('&quot;', '"')
		.replaceAll('&#39;', "'")
		.replaceAll('&amp;', '&');
}

function getAttribute(tag: string, name: string) {
	const match = tag.match(new RegExp(`\\b${name}\\s*=\\s*(["'])(.*?)\\1`, 'i'));
	return match?.[2] ? decodeHtmlEntities(match[2]) : undefined;
}

function isAllowedImageUrl(value: string | undefined): value is string {
	if (!value) return false;
	try {
		return new URL(value).protocol === 'https:';
	} catch {
		return false;
	}
}

export function sanitizeWhatsAppMessageTemplate(
	template: WhatsAppMessageTemplateDTO
): WhatsAppMessageTemplateDTO {
	const protectedPlaceholders = new Map<string, string>();
	let html = template.html.replace(/<([a-zA-Z][\w]*)>/g, (match, key: string) => {
		if (!placeholderSet.has(key)) return match;
		const token = `__WA_PLACEHOLDER_${protectedPlaceholders.size}__`;
		protectedPlaceholders.set(token, key);
		return token;
	});

	html = html
		.replace(/<!--[\s\S]*?-->/g, '')
		.replace(/<(script|style|iframe|object|embed)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, '')
		.replace(/<img\b[^>]*>/gi, tag => {
			const source = getAttribute(tag, 'src');
			if (!isAllowedImageUrl(source)) return '';
			const alt = getAttribute(tag, 'alt')?.trim();
			return `<img src="${escapeHtmlAttribute(source)}"${
				alt ? ` alt="${escapeHtmlAttribute(alt)}"` : ''
			}>`;
		})
		.replace(/<br\s*\/?\s*>/gi, '<br>')
		.replace(/<(\/?)\s*(strong|b|em|i|u|p|div)\b[^>]*>/gi, '<$1$2>')
		.replace(/<(?!\/?(?:strong|b|em|i|u|p|div)>|br>|img\b)[^>]*>/gi, '');

	for (const [token, key] of protectedPlaceholders) {
		html = html.replaceAll(token, `&lt;${key}&gt;`);
	}

	return { html: html.trim(), version: 1 };
}

function formatAddress(address: WhatsAppTemplateOrderData['address']) {
	if (!address) return 'Retirada na loja';
	return [
		`${address.street}, ${address.number}`,
		address.complement,
		address.neighborhood,
		`${address.city} - ${address.state}`,
		`CEP ${address.zipCode}`,
	]
		.filter(Boolean)
		.join(', ');
}

function buildPlaceholderValues(data: WhatsAppTemplateOrderData) {
	return {
		nome: data.userName,
		numeroPedido:
			data.orderNumber == null ? 'Aguardando confirmação' : String(data.orderNumber),
		formaPagamento:
			(
				{
					PIX: 'PIX',
					CASH: 'Dinheiro',
					CREDIT_CARD: 'Cartão de crédito',
					DEBIT_CARD: 'Cartão de débito',
				} as Record<string, string>
			)[data.paymentType ?? ''] ?? 'Não informado',
		telefone: data.phone,
		endereco: formatAddress(data.address),
		nomeLoja: data.storeName ?? '',
		statusPedido: statusLabels[data.status],
		totalPedido: data.total.toLocaleString('pt-BR', {
			currency: 'BRL',
			style: 'currency',
		}),
		itensPedido: data.items.map(item => `${item.quantity}x ${item.name}`).join(', '),
	} satisfies Record<WhatsAppMessagePlaceholderKey, string>;
}

function resolvePlaceholders(value: string, data: WhatsAppTemplateOrderData) {
	const values = buildPlaceholderValues(data);
	return value.replace(/<([a-zA-Z][\w]*)>/g, (placeholder, key: string) =>
		placeholderSet.has(key) ? values[key as WhatsAppMessagePlaceholderKey] : placeholder
	);
}

function underline(value: string) {
	return [...value]
		.map(character => (/\s/.test(character) ? character : `${character}\u0332`))
		.join('');
}

function normalizeText(value: string) {
	return value
		.replace(/[ \t]+\n/g, '\n')
		.replace(/\n{3,}/g, '\n\n')
		.trim();
}

export function resolveWhatsAppMessageTemplate(
	template: WhatsAppMessageTemplateDTO,
	data: WhatsAppTemplateOrderData
): ResolvedWhatsAppMessagePart[] {
	const sanitized = sanitizeWhatsAppMessageTemplate(template);
	const tokens = sanitized.html.match(/<[^>]+>|[^<]+/g) ?? [];
	const parts: ResolvedWhatsAppMessagePart[] = [];
	let currentText = '';
	let underlineDepth = 0;

	const flushText = () => {
		const text = normalizeText(currentText);
		if (text) parts.push({ text, type: 'text' });
		currentText = '';
	};

	for (const token of tokens) {
		if (!token.startsWith('<')) {
			const resolved = resolvePlaceholders(decodeHtmlEntities(token), data);
			currentText += underlineDepth > 0 ? underline(resolved) : resolved;
			continue;
		}

		const normalizedTag = token.toLowerCase();
		if (normalizedTag === '<strong>' || normalizedTag === '<b>') currentText += '*';
		else if (normalizedTag === '</strong>' || normalizedTag === '</b>') currentText += '*';
		else if (normalizedTag === '<em>' || normalizedTag === '<i>') currentText += '_';
		else if (normalizedTag === '</em>' || normalizedTag === '</i>') currentText += '_';
		else if (normalizedTag === '<u>') underlineDepth += 1;
		else if (normalizedTag === '</u>') underlineDepth = Math.max(0, underlineDepth - 1);
		else if (normalizedTag === '<br>') currentText += '\n';
		else if (normalizedTag === '</p>' || normalizedTag === '</div>') currentText += '\n';
		else if (normalizedTag.startsWith('<img')) {
			const source = getAttribute(token, 'src');
			if (!isAllowedImageUrl(source)) continue;
			flushText();
			const alt = getAttribute(token, 'alt');
			const caption = alt ? resolvePlaceholders(alt, data).trim() : '';
			parts.push({ ...(caption && { caption }), type: 'image', url: source });
		}
	}

	flushText();
	return parts;
}

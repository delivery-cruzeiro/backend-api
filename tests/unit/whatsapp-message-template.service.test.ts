import { OrderStatus } from '@delivery-cruzeiro/types';
import { describe, expect, it } from 'vitest';
import {
	resolveWhatsAppMessageTemplate,
	sanitizeWhatsAppMessageTemplate,
} from '../../src/services/whatsapp-message-template.service.js';

const orderData = {
	address: {
		city: 'Cruzeiro',
		complement: null,
		neighborhood: 'Centro',
		number: '10',
		state: 'SP',
		street: 'Rua A',
		zipCode: '12700-000',
	},
	items: [{ name: 'Pastel', quantity: 2 }],
	orderNumber: 1234,
	phone: '5511999999999',
	status: OrderStatus.PREPARING,
	storeName: 'Cruzeiro Centro',
	total: 25,
	userName: 'João',
};

describe('WhatsApp message template', () => {
	it('resolve placeholders and WhatsApp formatting in the backend', () => {
		const parts = resolveWhatsAppMessageTemplate(
			{
				html: '<p>Olá &lt;nome&gt;, pedido <strong>&lt;numeroPedido&gt;</strong>.</p>',
				version: 1,
			},
			orderData
		);

		expect(parts).toEqual([{ text: 'Olá João, pedido *1234*.', type: 'text' }]);
	});

	it('preserves image references as ordered sendable parts', () => {
		const parts = resolveWhatsAppMessageTemplate(
			{
				html: '<p>Seu pedido:</p><img src="https://cdn.example.com/order.png" alt="Pedido &lt;numeroPedido&gt;"><p>Obrigado</p>',
				version: 1,
			},
			orderData
		);

		expect(parts).toEqual([
			{ text: 'Seu pedido:', type: 'text' },
			{
				caption: 'Pedido 1234',
				type: 'image',
				url: 'https://cdn.example.com/order.png',
			},
			{ text: 'Obrigado', type: 'text' },
		]);
	});

	it('removes scripts, event handlers and non-HTTPS images', () => {
		const template = sanitizeWhatsAppMessageTemplate({
			html: '<script>alert(1)</script><strong onclick="x">Olá</strong><img src="javascript:alert(1)">',
			version: 1,
		});

		expect(template.html).toBe('<strong>Olá</strong>');
	});
});

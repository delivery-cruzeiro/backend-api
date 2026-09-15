import { describe, expect, it, vi } from 'vitest';
import {
	OrderStatus,
	PaymentType,
	WhatsAppMessageLocation,
	WhatsAppMessageOperation,
} from '@delivery-cruzeiro/types';
import { CheckoutPixService } from '../../src/services/checkout-pix.service.js';
import { ClientOrderService } from '../../src/services/client-order.service.js';
import { resolveWhatsAppMessageTemplate } from '../../src/services/whatsapp-message-template.service.js';

function fixture() {
	const database = {
		user: {
			findUnique: vi.fn().mockResolvedValue({ name: 'Cliente', phone: '(83) 99999-9999' }),
		},
		store: { findUnique: vi.fn().mockResolvedValue({ name: 'Loja' }) },
		address: { findFirst: vi.fn() },
		product: { findMany: vi.fn().mockResolvedValue([{ id: 'pizza', name: 'Pizza' }]) },
	};
	const orders = {
		prepareOrder: vi.fn().mockResolvedValue({ success: true, data: { total: 25 } }),
	};
	const configurations = {
		findActiveByEvent: vi
			.fn()
			.mockResolvedValue([
				{
					template: {
						version: 1,
						html: '<p>&lt;nome&gt;: &lt;formaPagamento&gt; &lt;totalPedido&gt;</p>',
					},
				},
			]),
	};
	const whatsapp = { sendText: vi.fn(), sendImage: vi.fn() };
	let now = 100_000;
	const service = new CheckoutPixService(
		database as never,
		orders as never,
		configurations as never,
		() => whatsapp as never,
		() => now
	);
	const dto = {
		paymentType: PaymentType.PIX,
		storeId: 'store',
		items: [{ productId: 'pizza', quantity: 1 }],
	};
	return {
		service,
		database,
		orders,
		configurations,
		whatsapp,
		dto,
		advance: () => {
			now += 40_000;
		},
	};
}
describe('Checkout PIX messages', () => {
	it('uses configured PIX template, validated totals and normalized customer phone', async () => {
		const f = fixture();
		expect(await f.service.send('customer', f.dto)).toEqual({
			phone: '5583999999999',
			retryAfter: 40,
		});
		expect(f.configurations.findActiveByEvent).toHaveBeenCalledWith(
			WhatsAppMessageLocation.PIX_ONLINE,
			WhatsAppMessageOperation.ENTRY
		);
		expect(f.orders.prepareOrder).toHaveBeenCalledWith('customer', f.dto);
		expect(f.whatsapp.sendText).toHaveBeenCalledWith(
			'5583999999999',
			expect.stringContaining('PIX R$')
		);
		expect(await f.service.send('customer', f.dto)).toMatchObject({ statusCode: 429 });
		f.advance();
		await f.service.send('customer', f.dto);
		expect(f.whatsapp.sendText).toHaveBeenCalledTimes(2);
	});
	it('rejects missing phone, invalid draft and missing configuration without sending', async () => {
		const f = fixture();
		f.database.user.findUnique.mockResolvedValueOnce({ name: 'Cliente', phone: null });
		expect(await f.service.send('customer', f.dto)).toMatchObject({ statusCode: 400 });
		f.advance();
		f.orders.prepareOrder.mockResolvedValueOnce({
			success: false,
			error: 'Produto indisponível',
			statusCode: 400,
		} as never);
		expect(await f.service.send('customer', f.dto)).toMatchObject({ statusCode: 400 });
		f.advance();
		f.configurations.findActiveByEvent.mockResolvedValueOnce([]);
		expect(await f.service.send('customer', f.dto)).toMatchObject({ statusCode: 409 });
		expect(f.whatsapp.sendText).not.toHaveBeenCalled();
	});
	it.each([PaymentType.PIX, PaymentType.CASH, PaymentType.CREDIT_CARD, PaymentType.DEBIT_CARD])(
		'retains %s while preparing without persisting or consuming coupons',
		async paymentType => {
			const repository = {
				findActiveStoreById: vi
					.fn()
					.mockResolvedValue({ id: 'store', addressId: 'store-address' }),
				findActiveProductsByIds: vi
					.fn()
					.mockResolvedValue([{ id: 'pizza', price: 25, additionalFields: [] }]),
				findActivePaymentMethodForUser: vi.fn().mockResolvedValue({ id: 'card' }),
				createClientOrder: vi.fn(),
			};
			const coupons = { consumeCouponUsage: vi.fn() };
			const orders = new ClientOrderService(
				repository as never,
				{ emitOrderChanged: vi.fn() },
				coupons as never
			);
			const prepared = await orders.prepareOrder('customer', {
				paymentType,
				paymentMethodId: paymentType.includes('CARD') ? 'card' : undefined,
				storeId: 'store',
				items: [{ productId: 'pizza', quantity: 1 }],
			});
			expect(prepared).toMatchObject({ success: true, data: { paymentType, total: 25 } });
			expect(repository.createClientOrder).not.toHaveBeenCalled();
			expect(coupons.consumeCouponUsage).not.toHaveBeenCalled();
		}
	);
	it.each([
		[PaymentType.PIX, 'PIX'],
		[PaymentType.CASH, 'Dinheiro'],
		[PaymentType.CREDIT_CARD, 'Cartão de crédito'],
		[PaymentType.DEBIT_CARD, 'Cartão de débito'],
	])('renders payment variable %s', (paymentType, label) => {
		expect(
			resolveWhatsAppMessageTemplate(
				{ version: 1, html: '&lt;formaPagamento&gt;' },
				{
					paymentType,
					orderNumber: null,
					items: [],
					phone: '',
					total: 0,
					userName: '',
					status: OrderStatus.PENDING,
				}
			)
		).toEqual([{ type: 'text', text: label }]);
	});
});

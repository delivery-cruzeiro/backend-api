import {
	OrderStatus,
	WhatsAppMessageLocation,
	WhatsAppMessageOperation,
} from '@delivery-cruzeiro/types';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { OrderWhatsAppRepository } from '../../src/repositories/order-whatsapp.repository.js';
import type { WhatsAppMessageConfigurationRepository } from '../../src/repositories/whatsapp-message-config.repository.js';
import {
	detectOrderListTransitions,
	OrderWhatsAppAutomationService,
} from '../../src/services/order-whatsapp-automation.service.js';
import { WhatsAppService } from '../../src/services/whatsapp.service.js';
import { Prisma } from '@prisma/client';
import { WahaHttpClient } from '../../src/integrations/whatsapp/waha/waha-http-client.js';
import { WahaWhatsAppProvider } from '../../src/integrations/whatsapp/waha/waha-whatsapp.provider.js';

describe('Order WhatsApp automation', () => {
	let configurationRepository: WhatsAppMessageConfigurationRepository;
	let orderRepository: OrderWhatsAppRepository;
	let whatsAppService: Pick<WhatsAppService, 'sendImage' | 'sendText'>;
	let serviceFactory: () => WhatsAppService;

	beforeEach(() => {
		configurationRepository = {
			create: vi.fn(),
			findActiveByEvent: vi.fn(),
			findById: vi.fn(),
			list: vi.fn(),
			update: vi.fn(),
		};
		orderRepository = { findMessageData: vi.fn() };
		whatsAppService = { sendImage: vi.fn(), sendText: vi.fn() };
		serviceFactory = vi.fn(() => whatsAppService as WhatsAppService);
	});

	it('detects exit and entry separately for a status transition', () => {
		expect(detectOrderListTransitions(OrderStatus.PENDING, OrderStatus.CONFIRMED)).toEqual([
			{
				location: WhatsAppMessageLocation.PENDING,
				operation: WhatsAppMessageOperation.EXIT,
			},
			{
				location: WhatsAppMessageLocation.CONFIRMED,
				operation: WhatsAppMessageOperation.ENTRY,
			},
		]);
	});

	it('does not create an event when the status has not changed', () => {
		expect(detectOrderListTransitions(OrderStatus.PREPARING, OrderStatus.PREPARING)).toEqual(
			[]
		);
	});

	it('does not load WhatsApp when no active configuration exists', async () => {
		vi.mocked(configurationRepository.findActiveByEvent).mockResolvedValue([]);
		const service = new OrderWhatsAppAutomationService(
			configurationRepository,
			orderRepository,
			serviceFactory
		);

		await service.dispatchTransition({
			nextStatus: OrderStatus.PENDING,
			orderId: 'order-1',
		});

		expect(orderRepository.findMessageData).toHaveBeenCalledWith('order-1');
		expect(serviceFactory).not.toHaveBeenCalled();
	});

	it('resolves customer data and sends each configured message part', async () => {
		vi.mocked(configurationRepository.findActiveByEvent).mockResolvedValue([
			{
				createdAt: new Date(),
				id: 'config-1',
				isActive: true,
				location: WhatsAppMessageLocation.PREPARING,
				operation: WhatsAppMessageOperation.ENTRY,
				template: {
					html: 'Olá &lt;nome&gt;, pedido &lt;numeroPedido&gt;',
					version: 1,
				},
				updatedAt: new Date(),
			},
		]);
		vi.mocked(orderRepository.findMessageData).mockResolvedValue({
			address: null,
			id: 'order-1',
			items: [],
			orderNumber: 42,
			status: OrderStatus.PREPARING,
			store: { name: 'Loja' },
			total: 20 as never,
			user: { name: 'Maria', phone: '5511999999999' },
		} as never);
		const service = new OrderWhatsAppAutomationService(
			configurationRepository,
			orderRepository,
			serviceFactory
		);

		await service.dispatchTransition({
			nextStatus: OrderStatus.PREPARING,
			orderId: 'order-1',
			previousStatus: OrderStatus.CONFIRMED,
		});

		expect(whatsAppService.sendText).toHaveBeenCalledWith(
			'5511999999999',
			'Olá Maria, pedido 42'
		);
	});
	it.each([
		[undefined, OrderStatus.PENDING, WhatsAppMessageLocation.PENDING],
		[OrderStatus.PENDING, OrderStatus.CONFIRMED, WhatsAppMessageLocation.CONFIRMED],
		[OrderStatus.CONFIRMED, OrderStatus.PREPARING, WhatsAppMessageLocation.PREPARING],
		[OrderStatus.PREPARING, OrderStatus.ON_THE_WAY, WhatsAppMessageLocation.ON_THE_WAY],
	] as const)('dispatches %s -> %s through the real service with a formatted recipient', async (previousStatus, nextStatus, location) => {
		vi.mocked(configurationRepository.findActiveByEvent).mockImplementation(async (eventLocation, operation) => eventLocation === location && operation === WhatsAppMessageOperation.ENTRY ? [{
			id: 'config-1', createdAt: new Date(), updatedAt: new Date(), isActive: true,
			location, operation, template: { version: 1, html: 'Olá &lt;nome&gt;, pedido &lt;numeroPedido&gt;' },
		}] : []);
		vi.mocked(orderRepository.findMessageData).mockResolvedValue({
			id: 'order-1', orderNumber: 42, status: nextStatus, total: new Prisma.Decimal(20),
			items: [], address: null, store: { name: 'Loja' }, user: { name: 'Maria', phone: '(83) 99999-9999' },
		});
		const fetchMock = vi.fn<typeof fetch>(async () => new Response('{}', { status: 200 }));
		const actualService = new WhatsAppService(new WahaWhatsAppProvider(new WahaHttpClient('http://waha:3000', 'test-key', 1000, fetchMock), 'default'));
		const logger = { error: vi.fn(), warn: vi.fn() };
		const automation = new OrderWhatsAppAutomationService(configurationRepository, orderRepository, () => actualService, logger);
		await automation.dispatchTransition({ orderId: 'order-1', previousStatus, nextStatus });
		expect(logger.error).not.toHaveBeenCalled();
		expect(fetchMock).toHaveBeenCalledTimes(1);
		expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))).toEqual({
			chatId: '5583999999999@c.us', session: 'default', text: 'Olá Maria, pedido 42',
		});
	});
});

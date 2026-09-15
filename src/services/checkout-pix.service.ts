import {
	OrderStatus,
	PaymentType,
	WhatsAppMessageLocation,
	WhatsAppMessageOperation,
	whatsAppPhoneSchema,
	whatsappMessageTemplateSchema,
	type ClientOrderDTO,
} from '@delivery-cruzeiro/types';
import { prisma } from '../lib/prisma.js';
import { getWhatsAppService } from '../integrations/whatsapp/whatsapp.factory.js';
import { PrismaWhatsAppMessageConfigurationRepository } from '../repositories/whatsapp-message-config.repository.js';
import { ClientOrderService } from './client-order.service.js';
import { resolveWhatsAppMessageTemplate } from './whatsapp-message-template.service.js';

export class CheckoutPixService {
	private readonly nextAttempts = new Map<string, number>();
	constructor(
		private readonly database = prisma,
		private readonly orders = new ClientOrderService(),
		private readonly configurations = new PrismaWhatsAppMessageConfigurationRepository(),
		private readonly whatsapp = getWhatsAppService,
		private readonly now = Date.now
	) {}

	async send(userId: string, dto: ClientOrderDTO) {
		if (dto.paymentType !== PaymentType.PIX)
			return { statusCode: 400, error: 'Selecione PIX para continuar.' };
		const now = this.now();
		for (const [key, expires] of this.nextAttempts)
			if (expires <= now) this.nextAttempts.delete(key);
		const nextAttempt = this.nextAttempts.get(userId) ?? 0;
		if (nextAttempt > now)
			return {
				statusCode: 429,
				error: 'Aguarde 40 segundos para reenviar.',
				retryAfter: Math.ceil((nextAttempt - now) / 1000),
			};
		this.nextAttempts.set(userId, now + 40_000);
		const user = await this.database.user.findUnique({
			where: { id: userId },
			select: { name: true, phone: true },
		});
		const phone = whatsAppPhoneSchema.safeParse(user?.phone);
		if (!user || !phone.success)
			return {
				statusCode: 400,
				error: 'Informe um número de WhatsApp válido no seu cadastro.',
			};
		const prepared = await this.orders.prepareOrder(userId, dto);
		if (!prepared.success) return prepared;
		const configurations = await this.configurations.findActiveByEvent(
			WhatsAppMessageLocation.PIX_ONLINE,
			WhatsAppMessageOperation.ENTRY
		);
		if (!configurations.length)
			return {
				statusCode: 409,
				error: 'A mensagem de pagamento por PIX online não está configurada. Entre em contato com a loja.',
			};
		const [store, address, products] = await Promise.all([
			this.database.store.findUnique({ where: { id: dto.storeId }, select: { name: true } }),
			dto.addressId
				? this.database.address.findFirst({ where: { id: dto.addressId, userId } })
				: null,
			this.database.product.findMany({
				where: { id: { in: dto.items.map(item => item.productId) } },
				select: { id: true, name: true },
			}),
		]);
		const parts = configurations.flatMap(configuration =>
			resolveWhatsAppMessageTemplate(
				whatsappMessageTemplateSchema.parse(configuration.template),
				{
					address,
					items: dto.items.map(item => ({
						name: products.find(product => product.id === item.productId)?.name ?? '',
						quantity: item.quantity,
					})),
					orderNumber: null,
					phone: phone.data,
					status: OrderStatus.PENDING,
					storeName: store?.name,
					total: prepared.data.total,
					userName: user.name,
					paymentType: PaymentType.PIX,
				}
			)
		);
		if (!parts.length)
			return { statusCode: 409, error: 'A mensagem de pagamento por PIX online está vazia.' };
		const whatsapp = this.whatsapp();
		for (const part of parts) {
			if (part.type === 'text') await whatsapp.sendText(phone.data, part.text);
			else await whatsapp.sendImage(phone.data, part.url, part.caption);
		}
		return { phone: phone.data, retryAfter: 40 };
	}
}

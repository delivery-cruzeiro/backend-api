import {
	OrderStatus,
	WhatsAppMessageLocation,
	WhatsAppMessageOperation,
	whatsappMessageTemplateSchema,
} from '@delivery-cruzeiro/types';
import { getWhatsAppService } from '../integrations/whatsapp/whatsapp.factory.js';
import {
	PrismaOrderWhatsAppRepository,
	type OrderWhatsAppRepository,
} from '../repositories/order-whatsapp.repository.js';
import {
	PrismaWhatsAppMessageConfigurationRepository,
	type WhatsAppMessageConfigurationRepository,
} from '../repositories/whatsapp-message-config.repository.js';
import type { WhatsAppService } from './whatsapp.service.js';
import { resolveWhatsAppMessageTemplate } from './whatsapp-message-template.service.js';

export type OrderListTransition = {
	location: WhatsAppMessageLocation;
	operation: WhatsAppMessageOperation;
};

type AutomationLogger = {
	error(context: unknown, message: string): void;
	warn(context: unknown, message: string): void;
};

const defaultLogger: AutomationLogger = {
	error: (context, message) => console.error(message, context),
	warn: (context, message) => console.warn(message, context),
};

const statusLocationMap: Partial<Record<OrderStatus, WhatsAppMessageLocation>> = {
	[OrderStatus.PENDING]: WhatsAppMessageLocation.PENDING,
	[OrderStatus.CONFIRMED]: WhatsAppMessageLocation.CONFIRMED,
	[OrderStatus.PREPARING]: WhatsAppMessageLocation.PREPARING,
	[OrderStatus.ON_THE_WAY]: WhatsAppMessageLocation.ON_THE_WAY,
};

export function detectOrderListTransitions(
	previousStatus: OrderStatus | undefined,
	nextStatus: OrderStatus
): OrderListTransition[] {
	if (previousStatus === nextStatus) return [];

	const transitions: OrderListTransition[] = [];
	const previousLocation = previousStatus ? statusLocationMap[previousStatus] : undefined;
	const nextLocation = statusLocationMap[nextStatus];

	if (previousLocation) {
		transitions.push({
			location: previousLocation,
			operation: WhatsAppMessageOperation.EXIT,
		});
	}
	if (nextLocation) {
		transitions.push({
			location: nextLocation,
			operation: WhatsAppMessageOperation.ENTRY,
		});
	}

	return transitions;
}

export class OrderWhatsAppAutomationService {
	constructor(
		private readonly configurationRepository: WhatsAppMessageConfigurationRepository = new PrismaWhatsAppMessageConfigurationRepository(),
		private readonly orderRepository: OrderWhatsAppRepository = new PrismaOrderWhatsAppRepository(),
		private readonly whatsAppServiceFactory: () => WhatsAppService = getWhatsAppService,
		private readonly logger: AutomationLogger = defaultLogger
	) {}

	enqueueTransition(input: {
		orderId: string;
		previousStatus?: OrderStatus;
		nextStatus: OrderStatus;
	}) {
		void this.dispatchTransition(input).catch(error => {
			this.logger.error(
				{ error, orderId: input.orderId },
				'Falha inesperada ao processar mensagens automaticas de WhatsApp'
			);
		});
	}

	async dispatchTransition(input: {
		orderId: string;
		previousStatus?: OrderStatus;
		nextStatus: OrderStatus;
	}) {
		const transitions = detectOrderListTransitions(input.previousStatus, input.nextStatus);
		if (transitions.length === 0) return;

		for (const transition of transitions) {
			await this.dispatchEvent(input.orderId, transition);
		}
	}

	private async dispatchEvent(orderId: string, transition: OrderListTransition) {
		const order = await this.orderRepository.findMessageData(orderId);
		if (!order) {
			this.logger.warn(
				{ orderId, transition },
				'Pedido de mensagem automatica nao encontrado'
			);
			return;
		}
		const matchingConfigurations = await this.configurationRepository.findActiveByEvent(
			transition.location,
			transition.operation,
			order.storePaymentMethodId
		);
		const specificConfigurations = matchingConfigurations.filter(
			configuration => configuration.paymentMethodId === order.storePaymentMethodId
		);
		const configurations = specificConfigurations.length > 0
			? specificConfigurations
			: matchingConfigurations.filter(configuration => !configuration.paymentMethodId);
		if (configurations.length === 0) return;
		if (!order.user?.phone) {
			this.logger.warn(
				{ orderId, transition },
				'Cliente sem telefone para mensagem automatica de WhatsApp'
			);
			return;
		}

		for (const configuration of configurations) {
			try {
				const template = whatsappMessageTemplateSchema.parse(configuration.template);
				const parts = resolveWhatsAppMessageTemplate(template, {
					address: order.address,
					items: order.items.map(item => ({
						name: item.product.name,
						quantity: item.quantity,
					})),
					paymentType: order.paymentType,
					paymentMethodName: order.storePaymentMethod?.name,
					orderNumber: order.orderNumber,
					phone: order.user.phone,
					status: order.status as OrderStatus,
					storeName: order.store?.name,
					total: Number(order.total),
					userName: order.user.name,
				});

				if (parts.length === 0) continue;
				const whatsAppService = this.whatsAppServiceFactory();
				for (const part of parts) {
					if (part.type === 'text') {
						await whatsAppService.sendText(order.user.phone, part.text);
					} else {
						await whatsAppService.sendImage(order.user.phone, part.url, part.caption);
					}
				}
			} catch (error) {
				this.logger.error(
					{ configurationId: configuration.id, error, orderId, transition },
					'Falha ao enviar mensagem automatica de WhatsApp'
				);
			}
		}
	}
}

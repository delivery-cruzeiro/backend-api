import {
	sendWhatsAppTextSchema,
	type WhatsAppQrCodeDTO,
	type WhatsAppStatusDTO,
} from '@delivery-cruzeiro/types';
import type { WhatsAppProvider } from '../integrations/whatsapp/whatsapp-provider.js';

export class WhatsAppService {
	constructor(private readonly provider: WhatsAppProvider) {}

	getStatus(): Promise<WhatsAppStatusDTO> {
		return this.provider.getStatus();
	}

	connect(): Promise<WhatsAppStatusDTO> {
		return this.provider.connect();
	}

	getQrCode(): Promise<WhatsAppQrCodeDTO> {
		return this.provider.getQrCode();
	}

	async disconnect(): Promise<WhatsAppStatusDTO> {
		await this.provider.disconnect();
		return this.provider.getStatus();
	}

	restart(): Promise<WhatsAppStatusDTO> {
		return this.provider.restart();
	}

	async sendText(phone: string, message: string): Promise<void> {
		// The shared schema removes profile formatting and supplies the DDI for local numbers.
		const input = sendWhatsAppTextSchema.parse({ message, phone });
		await this.provider.sendText(input.phone, input.message);
	}

	async sendImage(phone: string, imageUrl: string, caption?: string): Promise<void> {
		const input = sendWhatsAppTextSchema.pick({ phone: true }).parse({ phone });
		const url = new URL(imageUrl);
		if (url.protocol !== 'https:') {
			throw new Error('A imagem do WhatsApp deve usar uma URL HTTPS');
		}
		await this.provider.sendImage(input.phone, url.toString(), caption?.trim() || undefined);
	}
}

import type { WhatsAppQrCodeDTO, WhatsAppStatusDTO } from '@delivery-cruzeiro/types';

export interface WhatsAppProvider {
	getStatus(): Promise<WhatsAppStatusDTO>;
	connect(): Promise<WhatsAppStatusDTO>;
	getQrCode(): Promise<WhatsAppQrCodeDTO>;
	disconnect(): Promise<void>;
	restart(): Promise<WhatsAppStatusDTO>;
	sendText(phone: string, message: string): Promise<void>;
	sendImage(phone: string, imageUrl: string, caption?: string): Promise<void>;
}

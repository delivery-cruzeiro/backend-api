import {
	WhatsAppConnectionStatus,
	type WhatsAppQrCodeDTO,
	type WhatsAppStatusDTO,
} from '@delivery-cruzeiro/types';
import { WhatsAppIntegrationError } from '../whatsapp.errors.js';
import type { WhatsAppProvider } from '../whatsapp-provider.js';
import { WahaHttpClient, WahaHttpError } from './waha-http-client.js';

type WahaAccount = {
	id?: unknown;
	pushName?: unknown;
};

type WahaSession = {
	status?: unknown;
	me?: unknown;
};

type WahaQrCode = {
	mimetype?: unknown;
	data?: unknown;
};

const statusMap: Record<string, WhatsAppConnectionStatus> = {
	STOPPED: WhatsAppConnectionStatus.DISCONNECTED,
	STARTING: WhatsAppConnectionStatus.CONNECTING,
	SCAN_QR_CODE: WhatsAppConnectionStatus.WAITING_QR_CODE,
	WORKING: WhatsAppConnectionStatus.CONNECTED,
	FAILED: WhatsAppConnectionStatus.ERROR,
};

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null;
}

function parseAccount(value: unknown): WahaAccount | undefined {
	return isRecord(value) ? value : undefined;
}

function formatPhone(accountId: unknown) {
	if (typeof accountId !== 'string') {
		return undefined;
	}

	const phone = accountId.split('@')[0]?.split(':')[0]?.replace(/\D/g, '');
	return phone ? `+${phone}` : undefined;
}

export class WahaWhatsAppProvider implements WhatsAppProvider {
	constructor(
		private readonly client: WahaHttpClient,
		private readonly session: string
	) {}

	async getStatus(): Promise<WhatsAppStatusDTO> {
		try {
			const session = await this.getSession();
			return session ? this.toStatus(session) : this.disconnectedStatus();
		} catch (error) {
			throw this.toIntegrationError(error);
		}
	}

	async connect(): Promise<WhatsAppStatusDTO> {
		let session: WahaSession | undefined;

		try {
			session = await this.getSession();
		} catch (error) {
			throw this.toIntegrationError(error);
		}

		const current = session ? this.toStatus(session) : this.disconnectedStatus();

		if (current.connected || current.status === WhatsAppConnectionStatus.WAITING_QR_CODE) {
			return current;
		}

		if (!session) {
			try {
				await this.client.request('/api/sessions', {
					body: { name: this.session, start: false },
					method: 'POST',
				});
			} catch (error) {
				throw this.toIntegrationError(error);
			}
		}

		const operation = current.status === WhatsAppConnectionStatus.ERROR ? 'restart' : 'start';

		try {
			await this.client.request(
				`/api/sessions/${encodeURIComponent(this.session)}/${operation}`,
				{ method: 'POST' }
			);
			return await this.getStatus();
		} catch (error) {
			throw this.toIntegrationError(error);
		}
	}

	async getQrCode(): Promise<WhatsAppQrCodeDTO> {
		try {
			const qrCode = await this.client.request<WahaQrCode>(
				`/api/${encodeURIComponent(this.session)}/auth/qr?format=image`,
				{ headers: { Accept: 'application/json' } }
			);

			if (
				qrCode?.mimetype !== 'image/png' ||
				typeof qrCode.data !== 'string' ||
				!qrCode.data
			) {
				throw new WhatsAppIntegrationError(
					'QR_CODE_NOT_AVAILABLE',
					'O QR Code ainda nao esta disponivel. Aguarde e tente novamente.',
					409
				);
			}

			return { data: qrCode.data, mimeType: 'image/png' };
		} catch (error) {
			if (error instanceof WahaHttpError && [400, 404, 409, 422].includes(error.status)) {
				throw new WhatsAppIntegrationError(
					'QR_CODE_NOT_AVAILABLE',
					'O QR Code ainda nao esta disponivel. Aguarde e tente novamente.',
					409
				);
			}

			throw this.toIntegrationError(error);
		}
	}

	async disconnect(): Promise<void> {
		const status = await this.getStatus();
		if (status.status === WhatsAppConnectionStatus.DISCONNECTED) {
			return;
		}

		try {
			await this.client.request(`/api/sessions/${encodeURIComponent(this.session)}/logout`, {
				method: 'POST',
			});
			await this.client.request(`/api/sessions/${encodeURIComponent(this.session)}/stop`, {
				method: 'POST',
			});
		} catch (error) {
			throw this.toIntegrationError(error);
		}
	}

	async restart(): Promise<WhatsAppStatusDTO> {
		try {
			await this.client.request(`/api/sessions/${encodeURIComponent(this.session)}/restart`, {
				method: 'POST',
			});
			return await this.getStatus();
		} catch (error) {
			throw this.toIntegrationError(error);
		}
	}

	async sendText(phone: string, message: string): Promise<void> {
		const digits = phone.replace(/\D/g, '');

		try {
			await this.client.request('/api/sendText', {
				body: {
					chatId: `${digits}@c.us`,
					session: this.session,
					text: message,
				},
				method: 'POST',
			});
		} catch (error) {
			throw this.toIntegrationError(error);
		}
	}

	async sendImage(phone: string, imageUrl: string, caption?: string): Promise<void> {
		const digits = phone.replace(/\D/g, '');
		const pathname = new URL(imageUrl).pathname.toLowerCase();
		const extension = pathname.match(/\.(png|webp|gif|jpe?g)$/)?.[1] ?? 'jpg';
		const normalizedExtension = extension === 'jpeg' ? 'jpg' : extension;
		const mimeTypes: Record<string, string> = {
			gif: 'image/gif',
			jpg: 'image/jpeg',
			png: 'image/png',
			webp: 'image/webp',
		};

		try {
			await this.client.request('/api/sendImage', {
				body: {
					...(caption && { caption }),
					chatId: `${digits}@c.us`,
					file: {
						filename: `message-image.${normalizedExtension}`,
						mimetype: mimeTypes[normalizedExtension] ?? 'image/jpeg',
						url: imageUrl,
					},
					session: this.session,
				},
				method: 'POST',
			});
		} catch (error) {
			throw this.toIntegrationError(error);
		}
	}

	private toStatus(session: WahaSession): WhatsAppStatusDTO {
		if (!isRecord(session) || typeof session.status !== 'string') {
			throw new WhatsAppIntegrationError(
				'UNEXPECTED_PROVIDER_RESPONSE',
				'O servico do WhatsApp retornou uma resposta inesperada.',
				502
			);
		}

		const status = statusMap[session.status] ?? WhatsAppConnectionStatus.ERROR;
		const account = parseAccount(session.me);
		const name = typeof account?.pushName === 'string' ? account.pushName : undefined;
		const phone = formatPhone(account?.id);

		return {
			connected: status === WhatsAppConnectionStatus.CONNECTED,
			status,
			...(name && { name }),
			...(phone && { phone }),
		};
	}

	private disconnectedStatus(): WhatsAppStatusDTO {
		return { connected: false, status: WhatsAppConnectionStatus.DISCONNECTED };
	}

	private async getSession(): Promise<WahaSession | undefined> {
		try {
			return await this.client.request<WahaSession>(
				`/api/sessions/${encodeURIComponent(this.session)}`
			);
		} catch (error) {
			if (error instanceof WahaHttpError && error.status === 404) {
				return undefined;
			}

			throw error;
		}
	}

	private toIntegrationError(error: unknown) {
		if (error instanceof WhatsAppIntegrationError) {
			return error;
		}

		if (error instanceof WahaHttpError) {
			if (error.status === 401 || error.status === 403) {
				return new WhatsAppIntegrationError(
					'CONFIGURATION_ERROR',
					'A integracao com WhatsApp nao esta configurada corretamente.',
					503
				);
			}

			if (error.status >= 500) {
				return new WhatsAppIntegrationError(
					'PROVIDER_UNAVAILABLE',
					'O servico do WhatsApp esta indisponivel no momento.',
					503
				);
			}
		}

		return new WhatsAppIntegrationError(
			'UNEXPECTED_PROVIDER_RESPONSE',
			'O servico do WhatsApp nao conseguiu concluir a operacao.',
			502
		);
	}
}

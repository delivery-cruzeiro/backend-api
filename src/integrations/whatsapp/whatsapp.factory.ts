import { WhatsAppIntegrationError } from './whatsapp.errors.js';
import { WahaHttpClient } from './waha/waha-http-client.js';
import { WahaWhatsAppProvider } from './waha/waha-whatsapp.provider.js';
import { WhatsAppService } from '../../services/whatsapp.service.js';

let whatsAppService: WhatsAppService | undefined;

export function getWhatsAppService() {
	if (whatsAppService) {
		return whatsAppService;
	}

	const baseUrl = process.env.WAHA_URL?.replace(/\/$/, '');
	const apiKey = process.env.WAHA_API_KEY;
	const session = process.env.WAHA_SESSION?.trim() || 'default';
	const timeoutMs = Number(process.env.WAHA_TIMEOUT_MS ?? 10_000);

	if (!baseUrl || !apiKey || !Number.isFinite(timeoutMs) || timeoutMs <= 0) {
		throw new WhatsAppIntegrationError(
			'CONFIGURATION_ERROR',
			'A integracao com WhatsApp nao esta configurada corretamente.',
			503
		);
	}

	const client = new WahaHttpClient(baseUrl, apiKey, timeoutMs);
	whatsAppService = new WhatsAppService(new WahaWhatsAppProvider(client, session));
	return whatsAppService;
}

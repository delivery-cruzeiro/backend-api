import { describe, expect, it, vi } from 'vitest';
import { WhatsAppService } from '../../src/services/whatsapp.service.js';
import { WahaWhatsAppProvider } from '../../src/integrations/whatsapp/waha/waha-whatsapp.provider.js';
import { WahaHttpClient } from '../../src/integrations/whatsapp/waha/waha-http-client.js';

describe('WhatsAppService recipient normalization', () => {
	it('sends formatted customer phone numbers as an international WAHA chatId for text and image', async () => {
		const requests: Array<{ url: string; body: Record<string, unknown> }> = [];
		const fetchMock = vi.fn<typeof fetch>(async (url, options) => {
			requests.push({ url: String(url), body: JSON.parse(String(options?.body)) });
			return new Response('{}', { status: 200 });
		});
		const service = new WhatsAppService(new WahaWhatsAppProvider(new WahaHttpClient('http://waha:3000', 'test-key', 1000, fetchMock), 'default'));
		await service.sendText('(83) 99999-9999', 'Pedido confirmado');
		await service.sendImage('+55 (83) 99999-9999', 'https://example.com/image.png');
		expect(requests).toHaveLength(2);
		expect(requests[0]).toMatchObject({ url: 'http://waha:3000/api/sendText', body: { session: 'default', chatId: '5583999999999@c.us', text: 'Pedido confirmado' } });
		expect(requests[1].body.chatId).toBe('5583999999999@c.us');
	});
});

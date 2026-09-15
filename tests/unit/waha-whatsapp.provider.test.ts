import { WhatsAppConnectionStatus } from '@delivery-cruzeiro/types';
import { describe, expect, it, vi } from 'vitest';
import { WahaHttpClient } from '../../src/integrations/whatsapp/waha/waha-http-client.js';
import { WahaWhatsAppProvider } from '../../src/integrations/whatsapp/waha/waha-whatsapp.provider.js';

function jsonResponse(body: unknown, status = 200) {
	return new Response(JSON.stringify(body), {
		headers: { 'Content-Type': 'application/json' },
		status,
	});
}

function createProvider(fetchImplementation: typeof fetch) {
	return new WahaWhatsAppProvider(
		new WahaHttpClient('http://waha:3000', 'secret', 1_000, fetchImplementation),
		'default'
	);
}

describe('WahaWhatsAppProvider', () => {
	it('converte status e dados de conta sem expor o contrato do WAHA', async () => {
		const fetchMock = vi.fn(async () =>
			jsonResponse({
				status: 'WORKING',
				me: { id: '5511999999999@c.us', pushName: 'Empresa' },
			})
		) as unknown as typeof fetch;

		await expect(createProvider(fetchMock).getStatus()).resolves.toEqual({
			connected: true,
			name: 'Empresa',
			phone: '+5511999999999',
			status: WhatsAppConnectionStatus.CONNECTED,
		});
	});

	it('trata uma sessao inexistente como desconectada', async () => {
		const fetchMock = vi.fn(async () =>
			jsonResponse({ message: 'Not Found' }, 404)
		) as unknown as typeof fetch;

		await expect(createProvider(fetchMock).getStatus()).resolves.toEqual({
			connected: false,
			status: WhatsAppConnectionStatus.DISCONNECTED,
		});
	});

	it('cria e inicia uma sessao somente quando ela ainda nao existe', async () => {
		const responses = [
			jsonResponse({ message: 'Not Found' }, 404),
			jsonResponse({ name: 'default', status: 'STOPPED' }, 201),
			jsonResponse({ name: 'default', status: 'STARTING' }),
			jsonResponse({ name: 'default', status: 'SCAN_QR_CODE' }),
		];
		const fetchMock = vi.fn(
			async () => responses.shift() ?? jsonResponse({ message: 'Unexpected request' }, 500)
		) as unknown as typeof fetch;

		await expect(createProvider(fetchMock).connect()).resolves.toMatchObject({
			status: WhatsAppConnectionStatus.WAITING_QR_CODE,
		});
		expect(fetchMock).toHaveBeenCalledTimes(4);
		expect(String(fetchMock.mock.calls[1]?.[0])).toBe('http://waha:3000/api/sessions');
		expect(String(fetchMock.mock.calls[2]?.[0])).toContain('/api/sessions/default/start');
	});

	it('retorna QR Code Base64 no DTO interno', async () => {
		const fetchMock = vi.fn(async () =>
			jsonResponse({ data: 'base64-data', mimetype: 'image/png' })
		) as unknown as typeof fetch;

		await expect(createProvider(fetchMock).getQrCode()).resolves.toEqual({
			data: 'base64-data',
			mimeType: 'image/png',
		});
	});

	it('desvincula a conta e para a sessao', async () => {
		const responses = [
			jsonResponse({ status: 'WORKING' }),
			jsonResponse({ status: 'STARTING' }),
			jsonResponse({ status: 'STOPPED' }),
		];
		const fetchMock = vi.fn(
			async () => responses.shift() ?? jsonResponse({ message: 'Unexpected request' }, 500)
		) as unknown as typeof fetch;

		await createProvider(fetchMock).disconnect();

		expect(String(fetchMock.mock.calls[1]?.[0])).toContain('/logout');
		expect(String(fetchMock.mock.calls[2]?.[0])).toContain('/stop');
	});

	it('envia imagem por URL usando a mesma sessao e cliente WAHA', async () => {
		const fetchMock = vi.fn(async () =>
			jsonResponse({ id: 'message-1' })
		) as unknown as typeof fetch;

		await createProvider(fetchMock).sendImage(
			'5511999999999',
			'https://cdn.example.com/status.png',
			'Pedido pronto'
		);

		expect(String(fetchMock.mock.calls[0]?.[0])).toBe('http://waha:3000/api/sendImage');
		const request = fetchMock.mock.calls[0]?.[1] as RequestInit;
		expect(JSON.parse(String(request.body))).toEqual({
			caption: 'Pedido pronto',
			chatId: '5511999999999@c.us',
			file: {
				filename: 'message-image.png',
				mimetype: 'image/png',
				url: 'https://cdn.example.com/status.png',
			},
			session: 'default',
		});
	});
});

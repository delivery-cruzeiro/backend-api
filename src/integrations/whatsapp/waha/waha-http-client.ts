import { WhatsAppIntegrationError } from '../whatsapp.errors.js';

type FetchImplementation = typeof fetch;

type WahaRequestOptions = {
	body?: unknown;
	headers?: Record<string, string>;
	method?: 'GET' | 'POST';
};

export class WahaHttpError extends Error {
	constructor(public readonly status: number) {
		super(`WAHA_HTTP_${status}`);
		this.name = 'WahaHttpError';
	}
}

export class WahaHttpClient {
	constructor(
		private readonly baseUrl: string,
		private readonly apiKey: string,
		private readonly timeoutMs: number,
		private readonly fetchImplementation: FetchImplementation = fetch
	) {}

	async request<T>(path: string, options: WahaRequestOptions = {}): Promise<T> {
		const headers = new Headers(options.headers);
		headers.set('Accept', headers.get('Accept') ?? 'application/json');
		headers.set('X-Api-Key', this.apiKey);

		let body: string | undefined;
		if (options.body !== undefined) {
			headers.set('Content-Type', 'application/json');
			body = JSON.stringify(options.body);
		}

		try {
			const response = await this.fetchImplementation(`${this.baseUrl}${path}`, {
				body,
				headers,
				method: options.method ?? 'GET',
				signal: AbortSignal.timeout(this.timeoutMs),
			});

			if (!response.ok) {
				throw new WahaHttpError(response.status);
			}

			const responseText = await response.text();
			if (!responseText) {
				return undefined as T;
			}

			try {
				return JSON.parse(responseText) as T;
			} catch {
				throw new WhatsAppIntegrationError(
					'UNEXPECTED_PROVIDER_RESPONSE',
					'O servico do WhatsApp retornou uma resposta inesperada.',
					502
				);
			}
		} catch (error) {
			if (error instanceof WahaHttpError || error instanceof WhatsAppIntegrationError) {
				throw error;
			}

			if (
				error instanceof Error &&
				(error.name === 'TimeoutError' || error.name === 'AbortError')
			) {
				throw new WhatsAppIntegrationError(
					'PROVIDER_TIMEOUT',
					'O servico do WhatsApp demorou para responder. Tente novamente.',
					504
				);
			}

			throw new WhatsAppIntegrationError(
				'PROVIDER_UNAVAILABLE',
				'O servico do WhatsApp esta indisponivel no momento.',
				503
			);
		}
	}
}

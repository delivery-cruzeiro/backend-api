export type WhatsAppErrorCode =
	| 'CONFIGURATION_ERROR'
	| 'PROVIDER_UNAVAILABLE'
	| 'PROVIDER_TIMEOUT'
	| 'SESSION_FAILED'
	| 'QR_CODE_NOT_AVAILABLE'
	| 'UNEXPECTED_PROVIDER_RESPONSE';

export class WhatsAppIntegrationError extends Error {
	constructor(
		public readonly code: WhatsAppErrorCode,
		message: string,
		public readonly statusCode: number
	) {
		super(message);
		this.name = 'WhatsAppIntegrationError';
	}
}

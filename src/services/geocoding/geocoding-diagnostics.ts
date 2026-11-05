export function reportGeocodingFailure(
	provider: 'IBGE_CNEFE' | 'NOMINATIM',
	stage: 'database' | 'configuration' | 'queue' | 'request' | 'response',
	details: { error?: unknown; httpStatus?: number } = {}
) {
	const error = details.error as { code?: unknown; cause?: { code?: unknown }; name?: unknown } | undefined;
	const code = error?.cause?.code ?? error?.code;
	// Errors can contain customer query URLs or database credentials. Only permit
	// status/error codes and known stages; never serialize the original exception.
	console.warn('geocoding_provider_unavailable', {
		provider,
		stage,
		...(Number.isInteger(details.httpStatus) ? { httpStatus: details.httpStatus } : {}),
		...(typeof code === 'string' && /^[A-Z0-9_]{2,48}$/.test(code) ? { code } : {}),
		...(error?.name === 'TimeoutError' || error?.name === 'AbortError' ? { timeout: true } : {}),
	});
}

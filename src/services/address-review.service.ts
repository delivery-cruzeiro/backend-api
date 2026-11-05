export type AddressReviewReason = 'suburb_fallback' | 'location_unavailable';

export function addressReviewMetadata(reason: AddressReviewReason) {
	return { requiresAddressReview: true as const, addressReviewReason: reason };
}

export function snapshotRequiresAddressReview(snapshot: unknown): boolean {
	return !!snapshot && typeof snapshot === 'object'
		&& 'requiresAddressReview' in snapshot && snapshot.requiresAddressReview === true;
}

export function addressReviewNote(reason?: AddressReviewReason): string | undefined {
	if (!reason) return undefined;
	return reason === 'suburb_fallback'
		? 'Necessita revisão de endereço: localização aproximada pelo bairro. Conferir antes de confirmar o pedido.'
		: 'Necessita revisão de endereço: localização não confirmada; frete padrão da loja aplicado. Conferir antes de confirmar o pedido.';
}

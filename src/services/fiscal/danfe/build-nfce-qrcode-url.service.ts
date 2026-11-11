import type { FiscalEnvironment } from '../shared/types/fiscal-emission.types.js';

export class BuildNfceQrCodeUrlService {
	buildOnline(accessKey: string, environment: FiscalEnvironment) {
		const production = environment === '1';
		const qr = production
			? process.env.NFCE_QRCODE_URL_PRODUCTION
			: process.env.NFCE_QRCODE_URL_HOMOLOGATION;
		const urlChave = production
			? process.env.NFCE_ACCESS_KEY_URL_PRODUCTION
			: process.env.NFCE_ACCESS_KEY_URL_HOMOLOGATION;
		if (!qr || !urlChave || !officialUrl(qr) || !officialUrl(urlChave)) {
			throw new Error(
				'Configure as URLs oficiais do QR Code e da consulta por chave para a NFC-e.'
			);
		}
		return { qrCode: qr + '?p=' + [accessKey, '3', environment].join('|'), urlChave };
	}
}

function officialUrl(value: string) {
	try {
		const url = new URL(value);
		return (
			/^(https?:)$/.test(url.protocol) &&
			!url.search &&
			!url.hash &&
			!url.port &&
			!url.username &&
			!url.password &&
			/(^|\.)sefaz\.pb\.gov\.br$/i.test(url.hostname)
		);
	} catch {
		return false;
	}
}

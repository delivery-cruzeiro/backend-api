import { FiscalDocumentType } from '@prisma/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SefazGatewayService } from '../../src/services/fiscal/shared/sefaz/sefaz-gateway.service.js';

describe('SefazGatewayService', () => {
	const originalEnv = process.env;

	beforeEach(() => {
		process.env = { ...originalEnv };
		vi.stubGlobal(
			'fetch',
			vi.fn(async () => ({
				ok: true,
				text: async () =>
					'<cStat>100</cStat><xMotivo>Autorizado</xMotivo><nProt>123</nProt>',
			}))
		);
	});

	afterEach(() => {
		process.env = originalEnv;
		vi.unstubAllGlobals();
	});

	it('usa a URL de homologacao quando a transmissao esta em modo teste', async () => {
		process.env.SEFAZ_AUTHORIZATION_URL_HOMOLOG = 'https://sefaz.example/homolog';
		process.env.SEFAZ_NFCE_AUTHORIZATION_URL_HOMOLOG = 'https://sefaz.example/homolog-nfce';
		process.env.SEFAZ_NFCE_AUTHORIZATION_URL = 'https://sefaz.example/producao-nfce';
		const gateway = new SefazGatewayService();

		await gateway.transmit({
			documentType: FiscalDocumentType.NFCE,
			signedXml: '<signed />',
			test: true,
		});

		expect(fetch).toHaveBeenCalledWith('https://sefaz.example/homolog-nfce', expect.any(Object));
	});

	it('usa a URL de homologacao da NF-e quando o documento de teste e NF-e', async () => {
		process.env.SEFAZ_AUTHORIZATION_URL_HOMOLOG = 'https://sefaz.example/homolog';
		process.env.SEFAZ_NFE_AUTHORIZATION_URL_HOMOLOG = 'https://sefaz.example/homolog-nfe';
		process.env.SEFAZ_NFCE_AUTHORIZATION_URL_HOMOLOG = 'https://sefaz.example/homolog-nfce';
		const gateway = new SefazGatewayService();

		await gateway.transmit({
			documentType: FiscalDocumentType.NFE,
			signedXml: '<signed />',
			test: true,
		});

		expect(fetch).toHaveBeenCalledWith('https://sefaz.example/homolog-nfe', expect.any(Object));
	});

	it('mantem a URL do documento quando a transmissao nao esta em modo teste', async () => {
		process.env.SEFAZ_AUTHORIZATION_URL_HOMOLOG = 'https://sefaz.example/homolog';
		process.env.SEFAZ_NFCE_AUTHORIZATION_URL = 'https://sefaz.example/producao-nfce';
		const gateway = new SefazGatewayService();

		await gateway.transmit({
			documentType: FiscalDocumentType.NFCE,
			signedXml: '<signed />',
		});

		expect(fetch).toHaveBeenCalledWith(
			'https://sefaz.example/producao-nfce',
			expect.any(Object)
		);
	});
});

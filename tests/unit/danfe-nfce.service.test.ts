import { createHash } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { BuildNfceQrCodeUrlService } from '../../src/services/fiscal/danfe/build-nfce-qrcode-url.service.js';
import { GenerateDanfeNfceService } from '../../src/services/fiscal/danfe/generate-danfe-nfce.service.js';

const nfceXml = `
<NFe xmlns="http://www.portalfiscal.inf.br/nfe">
  <infNFe Id="NFe25260518016122000131650090000000011000182730" versao="4.00">
    <ide>
      <mod>65</mod>
      <serie>9</serie>
      <nNF>1</nNF>
      <dhEmi>2026-05-16T10:30:00.000Z</dhEmi>
      <tpEmis>1</tpEmis>
      <tpAmb>2</tpAmb>
    </ide>
    <emit>
      <CNPJ>18016122000131</CNPJ>
      <xNome>Pastel do Cruzeiro LTDA</xNome>
      <xFant>Pastel do Cruzeiro</xFant>
      <IE>123456789</IE>
      <enderEmit>
        <xLgr>Avenida Francisco Lopes de Almeida</xLgr>
        <nro>250</nro>
        <xBairro>Cruzeiro</xBairro>
        <xMun>Campina Grande</xMun>
        <UF>PB</UF>
        <CEP>58417290</CEP>
      </enderEmit>
    </emit>
    <det nItem="1">
      <prod>
        <xProd>Pastel de queijo</xProd>
        <qCom>2.0000</qCom>
        <vUnCom>8.50</vUnCom>
        <vProd>17.00</vProd>
      </prod>
    </det>
    <total>
      <ICMSTot>
        <vNF>17.00</vNF>
      </ICMSTot>
    </total>
    <pag>
      <detPag>
        <tPag>01</tPag>
        <vPag>17.00</vPag>
      </detPag>
    </pag>
  </infNFe>
</NFe>`;

describe('DANFE NFC-e', () => {
	beforeEach(() => {
		process.env.CSC_ID = '1';
		process.env.CSC_HOMOLOGATION = 'ABC123XYZ456';
		process.env.NFCE_QRCODE_URL_HOMOLOGATION = 'https://sefaz.example/nfce/qrcode';
	});

	afterEach(() => {
		delete process.env.CSC_ID;
		delete process.env.CSC_HOMOLOGATION;
		delete process.env.NFCE_QRCODE_URL_HOMOLOGATION;
	});

	it('monta URL do QRCode com hash CSC em SHA1', () => {
		const service = new BuildNfceQrCodeUrlService();
		const accessKey = '25260518016122000131650090000000011000182730';
		const payload = `${accessKey}|2|2|1`;
		const hash = createHash('sha1')
			.update(`${payload}ABC123XYZ456`)
			.digest('hex')
			.toUpperCase();

		expect(service.execute({ accessKey, environment: '2' })).toBe(
			`https://sefaz.example/nfce/qrcode?p=${payload}|${hash}`
		);
	});

	it('gera payload ESC/POS em base64 com dados fiscais e QRCode', () => {
		const service = new GenerateDanfeNfceService();

		const result = service.execute({
			protocol: '123456789',
			xml: nfceXml,
		});
		const bytes = Buffer.from(result.contentBase64, 'base64');
		const printable = bytes.toString('utf8');

		expect(result).toMatchObject({
			accessKey: '25260518016122000131650090000000011000182730',
			columns: 48,
			encoding: 'base64',
			format: 'ESC_POS',
		});
		expect(result.qrCodeUrl).toContain('https://sefaz.example/nfce/qrcode?p=');
		expect(bytes.subarray(0, 2)).toEqual(Buffer.from([0x1b, 0x40]));
		expect(bytes.includes(0x1d)).toBe(true);
		expect(printable).toContain('DANFE NFC-e');
		expect(printable).toContain('Pastel de queijo');
		expect(printable).toContain('Protocolo 123456789');
	});

	it('falha claramente quando CSC nao esta configurado', () => {
		delete process.env.CSC_HOMOLOGATION;
		const service = new BuildNfceQrCodeUrlService();

		expect(() =>
			service.execute({
				accessKey: '25260518016122000131650090000000011000182730',
				environment: '2',
			})
		).toThrow('CSC_ID e CSC_PRODUCTION/CSC_HOMOLOGATION');
	});
});

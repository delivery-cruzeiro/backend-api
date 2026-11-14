import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
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
        <cProd>PASTEL01</cProd><uCom>UN</uCom>
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
  <infNFeSupl><qrCode>https://www.sefaz.pb.gov.br/nfcehom?p=25260518016122000131650090000000011000182730|3|2</qrCode><urlChave>https://www.sefaz.pb.gov.br/nfcehom</urlChave></infNFeSupl>
</NFe>`;

describe('DANFE NFC-e', () => {
	beforeEach(() => {
		vi.stubEnv('NFCE_QRCODE_URL_HOMOLOGATION', 'https://www.sefaz.pb.gov.br/nfcehom');
		vi.stubEnv('NFCE_ACCESS_KEY_URL_HOMOLOGATION', 'https://www.sefaz.pb.gov.br/nfcehom');
	});
	afterEach(() => vi.unstubAllEnvs());

	it('monta o QR Code online versão 3 no ambiente da nota', () => {
		const accessKey = '25260518016122000131650090000000011000182730';
		expect(new BuildNfceQrCodeUrlService().buildOnline(accessKey, '2')).toEqual({
			qrCode: 'https://www.sefaz.pb.gov.br/nfcehom?p=' + accessKey + '|3|2',
			urlChave: 'https://www.sefaz.pb.gov.br/nfcehom',
		});
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
		expect(result.qrCodeUrl).toBe(
			'https://www.sefaz.pb.gov.br/nfcehom?p=25260518016122000131650090000000011000182730|3|2'
		);
		expect(bytes.subarray(0, 2)).toEqual(Buffer.from([0x1b, 0x40]));
		expect(bytes.includes(0x1d)).toBe(true);
		expect(printable).toContain('DANFE NFC-e');
		expect(printable).toContain('Pastel de queijo');
		expect(printable).toContain('Protocolo 123456789');
		expect(result.data).toMatchObject({
			accessKey: result.accessKey,
			qrCodeUrl: result.qrCodeUrl,
			protocol: '123456789',
		});
		expect(printable.replace(/\r?\n/g, '')).toContain(
			result.accessKey.replace(/(\d{4})(?=\d)/g, '$1 ')
		);
	});

	it('bloqueia a impressão de XML sem o QR Code original', () => {
		expect(() =>
			new GenerateDanfeNfceService().execute({
				xml: nfceXml.replace(/<infNFeSupl>.*<\/infNFeSupl>/, ''),
			})
		).toThrow('O XML da NFC-e não contém o QR Code.');
	});
	it('preserva consumidor, acréscimos e mensagens sem confundir dados do emitente', () => {
		const xml = nfceXml
			.replace(
				'<det nItem="1">',
				'<dest><CPF>12345678901</CPF><xNome>Consumidor</xNome><enderDest><xLgr>Rua destino</xLgr><nro>10</nro><xMun>Outra cidade</xMun><UF>PE</UF></enderDest></dest><det nItem="1">'
			)
			.replace(
				'<vNF>17.00</vNF>',
				'<vFrete>2.00</vFrete><vSeg>1.00</vSeg><vOutro>0.50</vOutro><vDesc>0.25</vDesc><vNF>20.25</vNF>'
			)
			.replace(
				'</infNFe>',
				'<infAdic><infAdFisco>Mensagem fiscal</infAdFisco><infCpl>Complemento</infCpl></infAdic></infNFe>'
			);
		const { data } = new GenerateDanfeNfceService().execute({ xml });
		expect(data).toMatchObject({
			recipient: { id: '12345678901', idType: 'CPF', name: 'Consumidor' },
			freight: '2.00',
			insurance: '1.00',
			otherCharges: '0.50',
			discount: '0.25',
			total: '20.25',
			additionalInfo: 'Mensagem fiscal\nComplemento',
			emit: { name: 'Pastel do Cruzeiro LTDA', state: 'PB' },
		});
		expect(data.products[0]).toMatchObject({ code: 'PASTEL01', unit: 'UN' });
	});
});

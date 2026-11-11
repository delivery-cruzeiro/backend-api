import { describe, expect, it, vi } from 'vitest';
import { SefazGatewayService } from '../../src/services/fiscal/shared/sefaz/sefaz-gateway.service.js';

const key = '25261112345678000195650090000000011000182735';
const input = {
	accessKey: key,
	batchId: '42',
	documentType: 'NFCE',
	issuerCnpj: '12345678000195',
	environment: '2',
	signedXml:
		'<NFe><Signature xmlns="http://www.w3.org/2000/09/xmldsig#"><DigestValue>fixture</DigestValue></Signature></NFe>',
} as const;

function envelope(tag: string, status: string, payload: string, environment = '2') {
	return `<s:Envelope xmlns:s="http://www.w3.org/2003/05/soap-envelope"><s:Body>
		<f:${tag} xmlns:f="http://www.portalfiscal.inf.br/nfe"><f:tpAmb>${environment}</f:tpAmb>
		<f:cStat>${status}</f:cStat>${payload}</f:${tag}></s:Body></s:Envelope>`;
}

function protocol(accessKey = key, number = '325260000000001', digest = 'fixture') {
	return `<f:protNFe versao="4.00"><f:infProt><f:tpAmb>2</f:tpAmb><f:chNFe>${accessKey}</f:chNFe>
		<f:dhRecbto>2026-11-10T12:00:00-03:00</f:dhRecbto><f:nProt>${number}</f:nProt><f:digVal>${digest}</f:digVal>
		<f:cStat>100</f:cStat></f:infProt></f:protNFe>`;
}

describe('SEFAZ', () => {
	it('envia lote unitário e interpreta 104/100 como autorização do documento', async () => {
		const send = vi.fn().mockResolvedValue(envelope('retEnviNFe', '104', protocol()));
		const gateway = new SefazGatewayService(send);
		const result = await gateway.transmit(input);
		expect(result).toMatchObject({
			status: 'AUTHORIZED',
			protocol: '325260000000001',
			statusCode: '100',
		});
		const [url, action, soap, issuer] = send.mock.calls[0];
		expect(url.hostname).toBe('nfce-homologacao.svrs.rs.gov.br');
		expect(url.pathname).toBe('/ws/NfeAutorizacao/NFeAutorizacao4.asmx');
		expect(action).toContain('NFeAutorizacao4/nfeAutorizacaoLote');
		expect(soap).toContain('<idLote>42</idLote><indSinc>1</indSinc><NFe>');
		expect(issuer).toBe(input.issuerCnpj);
	});

	it('acompanha o recibo 103/105 pelo serviço de retorno', async () => {
		const receipt = '252600000000001';
		const send = vi
			.fn()
			.mockResolvedValueOnce(
				envelope('retEnviNFe', '103', `<f:infRec><f:nRec>${receipt}</f:nRec></f:infRec>`)
			)
			.mockResolvedValueOnce(envelope('retConsReciNFe', '105', ''));
		const gateway = new SefazGatewayService(send);
		expect(await gateway.transmit(input)).toMatchObject({ status: 'AWAITING_SEFAZ', receipt });
		expect(await gateway.reconcile(input, receipt)).toMatchObject({
			status: 'AWAITING_SEFAZ',
			statusCode: '105',
		});
		expect(send.mock.calls[1][2]).toContain(`<nRec>${receipt}</nRec>`);
		expect(send.mock.calls[1][0].pathname).toBe('/ws/NfeRetAutorizacao/NFeRetAutorizacao4.asmx');
	});

	it.each([
		protocol('25261112345678000195650090000000011000182736'),
		protocol(key, ''),
		protocol(key, '325260000000001', 'other-digest'),
	])('mantém pendência com chave, protocolo ou digest divergente', async returned => {
		const gateway = new SefazGatewayService(
			vi.fn().mockResolvedValue(envelope('retEnviNFe', '104', returned))
		);
		expect(await gateway.transmit(input)).toMatchObject({ status: 'AWAITING_SEFAZ' });
	});

	it('consulta pela chave original após uma resposta perdida', async () => {
		const send = vi
			.fn()
			.mockRejectedValueOnce(new Error('timeout'))
			.mockResolvedValueOnce(envelope('retConsSitNFe', '100', protocol()));
		const gateway = new SefazGatewayService(send);
		expect(await gateway.transmit(input)).toMatchObject({ status: 'AWAITING_SEFAZ' });
		expect(await gateway.reconcile(input, null)).toMatchObject({ status: 'AUTHORIZED' });
		expect(send.mock.calls[1][1]).toContain('NFeConsultaProtocolo4/nfeConsultaNF');
		expect(send.mock.calls[1][0].pathname).toBe('/ws/NfeConsulta/NfeConsulta4.asmx');
		expect(send.mock.calls[1][2]).toContain(`<chNFe>${key}</chNFe>`);
	});

	it('não recupera como vigente uma autorização de nota já cancelada', async () => {
		const send = vi.fn().mockResolvedValue(envelope('retConsSitNFe', '101', protocol()));
		const gateway = new SefazGatewayService(send);
		expect(await gateway.reconcile(input, null)).toMatchObject({
			status: 'AWAITING_SEFAZ',
			statusCode: '101',
		});
	});
});

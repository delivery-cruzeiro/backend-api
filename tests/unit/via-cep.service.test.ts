import { describe, expect, it, vi } from 'vitest';
import { ViaCepService } from '../../src/services/via-cep.service.js';

function jsonResponse(payload: unknown): Response {
	return new Response(JSON.stringify(payload), {
		headers: { 'content-type': 'application/json' },
		status: 200,
	});
}

describe('ViaCepService', () => {
	it('normaliza o CEP e converte o endereco retornado pelo ViaCEP', async () => {
		const fetcher = vi.fn().mockResolvedValue(
			jsonResponse({
				bairro: 'Se',
				cep: '01001-000',
				complemento: 'lado impar',
				localidade: 'Sao Paulo',
				logradouro: 'Praca da Se',
				uf: 'SP',
			})
		);
		const service = new ViaCepService(fetcher as unknown as typeof fetch);

		const result = await service.lookupByZipCode('01001-000');

		expect(fetcher).toHaveBeenCalledWith(
			'https://viacep.com.br/ws/01001000/json/',
			expect.objectContaining({ headers: { accept: 'application/json' } })
		);
		expect(result).toEqual({
			city: 'Sao Paulo',
			complement: 'lado impar',
			neighborhood: 'Se',
			state: 'SP',
			street: 'Praca da Se',
			zipCode: '01001-000',
		});
	});

	it('retorna nulo quando o ViaCEP informa que o CEP nao existe', async () => {
		const fetcher = vi.fn().mockResolvedValue(jsonResponse({ erro: true }));
		const service = new ViaCepService(fetcher as unknown as typeof fetch);

		await expect(service.lookupByZipCode('00000000')).resolves.toBeNull();
	});

	it('retorna e remove duplicatas da busca reversa por endereco', async () => {
		const fetcher = vi.fn().mockResolvedValue(
			jsonResponse([
				{
					bairro: 'Bela Vista',
					cep: '01310-100',
					localidade: 'Sao Paulo',
					logradouro: 'Avenida Paulista',
					uf: 'SP',
				},
				{
					bairro: 'Bela Vista',
					cep: '01310-100',
					localidade: 'Sao Paulo',
					logradouro: 'Avenida Paulista',
					uf: 'SP',
				},
				{
					bairro: 'Cerqueira Cesar',
					cep: '01311-200',
					localidade: 'Sao Paulo',
					logradouro: 'Avenida Paulista',
					uf: 'SP',
				},
			])
		);
		const service = new ViaCepService(fetcher as unknown as typeof fetch);

		const results = await service.searchByAddress({
			city: 'Sao Paulo',
			state: 'sp',
			street: 'Avenida Paulista',
		});

		expect(results).toHaveLength(2);
		expect(fetcher).toHaveBeenCalledWith(
			'https://viacep.com.br/ws/SP/Sao%20Paulo/Avenida%20Paulista/json/',
			expect.any(Object)
		);
	});

	it('valida endereco ignorando acentos e diferencas de caixa', async () => {
		const fetcher = vi.fn().mockResolvedValue(
			jsonResponse({
				bairro: 'Se',
				cep: '01001-000',
				localidade: 'Sao Paulo',
				logradouro: 'Praca da Se',
				uf: 'SP',
			})
		);
		const service = new ViaCepService(fetcher as unknown as typeof fetch);

		await expect(
			service.validateAddress({
				city: 'sao paulo',
				neighborhood: 'se',
				state: 'sp',
				street: 'praca da se',
				zipCode: '01001-000',
			})
		).resolves.toBe(true);
	});
});

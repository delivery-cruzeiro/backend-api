const VIA_CEP_BASE_URL = 'https://viacep.com.br/ws';
const VIA_CEP_TIMEOUT_MS = 8_000;

type Fetcher = typeof fetch;

type ViaCepPayload = {
	bairro?: unknown;
	cep?: unknown;
	complemento?: unknown;
	erro?: unknown;
	localidade?: unknown;
	logradouro?: unknown;
	uf?: unknown;
};

export type ViaCepAddress = {
	city: string;
	complement: string;
	neighborhood: string;
	state: string;
	street: string;
	zipCode: string;
};

export type AddressForZipCodeValidation = Pick<
	ViaCepAddress,
	'city' | 'neighborhood' | 'state' | 'street' | 'zipCode'
>;

export class ViaCepUnavailableError extends Error {
	constructor(message = 'Nao foi possivel consultar o ViaCEP') {
		super(message);
		this.name = 'ViaCepUnavailableError';
	}
}

export function normalizeZipCode(zipCode: string): string {
	return zipCode.replace(/\D/g, '');
}

function readText(value: unknown): string {
	return typeof value === 'string' ? value.trim() : '';
}

function normalizeComparable(value: string): string {
	return value
		.normalize('NFD')
		.replace(/[\u0300-\u036f]/g, '')
		.replace(/[^A-Za-z0-9]+/g, ' ')
		.trim()
		.replace(/\s+/g, ' ')
		.toUpperCase();
}

function parseViaCepAddress(payload: ViaCepPayload): ViaCepAddress | null {
	if (payload.erro === true || payload.erro === 'true') {
		return null;
	}

	const zipCode = readText(payload.cep);
	const city = readText(payload.localidade);
	const state = readText(payload.uf).toUpperCase();

	if (normalizeZipCode(zipCode).length !== 8 || !city || state.length !== 2) {
		return null;
	}

	return {
		city,
		complement: readText(payload.complemento),
		neighborhood: readText(payload.bairro),
		state,
		street: readText(payload.logradouro),
		zipCode,
	};
}

export class ViaCepService {
	constructor(private readonly fetcher: Fetcher = fetch) {}

	private async request(path: string): Promise<unknown> {
		let response: Response;

		try {
			response = await this.fetcher(`${VIA_CEP_BASE_URL}/${path}`, {
				headers: { accept: 'application/json' },
				signal: AbortSignal.timeout(VIA_CEP_TIMEOUT_MS),
			});
		} catch {
			throw new ViaCepUnavailableError();
		}

		if (!response.ok) {
			throw new ViaCepUnavailableError(`ViaCEP respondeu com status ${response.status}`);
		}

		try {
			return await response.json();
		} catch {
			throw new ViaCepUnavailableError('ViaCEP retornou uma resposta invalida');
		}
	}

	async lookupByZipCode(zipCode: string): Promise<ViaCepAddress | null> {
		const normalizedZipCode = normalizeZipCode(zipCode);

		if (normalizedZipCode.length !== 8) {
			return null;
		}

		const payload = await this.request(`${normalizedZipCode}/json/`);

		if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
			return null;
		}

		return parseViaCepAddress(payload as ViaCepPayload);
	}

	async searchByAddress(input: {
		city: string;
		state: string;
		street: string;
	}): Promise<ViaCepAddress[]> {
		const state = input.state.trim().toUpperCase();
		const city = input.city.trim();
		const street = input.street.trim();

		if (state.length !== 2 || city.length < 3 || street.length < 3) {
			return [];
		}

		const payload = await this.request(
			`${encodeURIComponent(state)}/${encodeURIComponent(city)}/${encodeURIComponent(street)}/json/`
		);

		if (!Array.isArray(payload)) {
			return [];
		}

		const uniqueResults = new Map<string, ViaCepAddress>();

		payload.forEach(item => {
			if (!item || typeof item !== 'object' || Array.isArray(item)) {
				return;
			}

			const parsedAddress = parseViaCepAddress(item as ViaCepPayload);

			if (parsedAddress) {
				uniqueResults.set(normalizeZipCode(parsedAddress.zipCode), parsedAddress);
			}
		});

		return Array.from(uniqueResults.values());
	}

	async validateAddress(address: AddressForZipCodeValidation): Promise<boolean> {
		const result = await this.lookupByZipCode(address.zipCode);

		if (!result) {
			return false;
		}

		if (
			normalizeComparable(result.state) !== normalizeComparable(address.state) ||
			normalizeComparable(result.city) !== normalizeComparable(address.city)
		) {
			return false;
		}

		if (
			result.street &&
			normalizeComparable(result.street) !== normalizeComparable(address.street)
		) {
			return false;
		}

		if (
			result.neighborhood &&
			normalizeComparable(result.neighborhood) !== normalizeComparable(address.neighborhood)
		) {
			return false;
		}

		return true;
	}
}

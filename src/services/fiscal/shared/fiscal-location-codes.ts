const STATE_CODES_BY_UF: Record<string, string> = {
	AC: '12',
	AL: '27',
	AM: '13',
	AP: '16',
	BA: '29',
	CE: '23',
	DF: '53',
	ES: '32',
	GO: '52',
	MA: '21',
	MG: '31',
	MS: '50',
	MT: '51',
	PA: '15',
	PB: '25',
	PE: '26',
	PI: '22',
	PR: '41',
	RJ: '33',
	RN: '24',
	RO: '11',
	RR: '14',
	RS: '43',
	SC: '42',
	SE: '28',
	SP: '35',
	TO: '17',
};

const CITY_CODES_BY_STATE_AND_CITY: Record<string, string> = {
	'PB:CAMPINA GRANDE': '2504009',
};

export function getFiscalStateCode(state: string | null | undefined) {
	const uf = normalizeState(state);

	return uf ? (STATE_CODES_BY_UF[uf] ?? null) : null;
}

export function getFiscalCityCode(input: {
	city: string | null | undefined;
	state: string | null | undefined;
}) {
	const uf = normalizeState(input.state);
	const city = normalizeCity(input.city);

	if (!uf || !city) {
		return null;
	}

	return CITY_CODES_BY_STATE_AND_CITY[`${uf}:${city}`] ?? null;
}

function normalizeState(state: string | null | undefined) {
	const value = state?.trim().toUpperCase();

	return value?.length === 2 ? value : null;
}

function normalizeCity(city: string | null | undefined) {
	return city
		?.normalize('NFD')
		.replace(/[\u0300-\u036f]/g, '')
		.trim()
		.toUpperCase();
}

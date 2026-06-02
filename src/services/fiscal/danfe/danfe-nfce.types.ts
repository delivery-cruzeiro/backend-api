export interface DanfeNfceProduct {
	name: string;
	quantity: string;
	total: string;
	unitValue: string;
}

export interface DanfeNfceData {
	accessKey: string;
	authorizationDate: string | null;
	contingency: boolean;
	emit: {
		city: string;
		cnpj: string;
		ie: string | null;
		name: string;
		neighborhood: string;
		number: string;
		state: string;
		street: string;
		tradeName: string | null;
		zipCode: string;
	};
	environment: string;
	fiscalNumber: string;
	issuedAt: string;
	model: string;
	payments: Array<{
		amount: string;
		type: string;
	}>;
	products: DanfeNfceProduct[];
	protocol: string | null;
	qrCodeUrl: string;
	serie: string;
	total: string;
}

export interface DanfeNfcePrintPayload {
	accessKey: string;
	columns: 48;
	contentBase64: string;
	encoding: 'base64';
	format: 'ESC_POS';
	qrCodeUrl: string;
}

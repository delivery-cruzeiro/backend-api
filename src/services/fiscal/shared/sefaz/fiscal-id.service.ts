import {
	PrismaSalesRepository,
	type SalesRepository,
} from '../../../../repositories/sales.repository.js';
import {
	DEFAULT_FISCAL_SERIE,
	FISCAL_EMISSION_TYPES,
	type CreateFiscalIdentityInput,
	type FiscalIdentity,
} from '../types/fiscal-id.types.js';
import { FiscalAccessKeyBuilderService } from './fiscal-access-key-builder.service.js';
import { FiscalSequenceService } from './fiscal-sequence.service.js';

type CreateFiscalIdentityResult =
	| {
			identity: FiscalIdentity;
			success: true;
	  }
	| {
			error: string;
			statusCode: 404;
			success: false;
	  };

export class FiscalIdService {
	constructor(
		private readonly salesRepository: SalesRepository = new PrismaSalesRepository(),
		private readonly fiscalSequenceService = new FiscalSequenceService(),
		private readonly accessKeyBuilder = new FiscalAccessKeyBuilderService()
	) {}

	async createForOrder(input: CreateFiscalIdentityInput): Promise<CreateFiscalIdentityResult> {
		const sale = await this.salesRepository.findFiscalSaleById(input.orderId);

		if (!sale) {
			return {
				error: 'Pedido nao encontrado',
				statusCode: 404,
				success: false,
			};
		}

		const serie = input.serie ?? DEFAULT_FISCAL_SERIE;
		const emissionType = input.emissionType ?? FISCAL_EMISSION_TYPES.NORMAL;
		const issueDate = input.issueDate ?? new Date();

		this.accessKeyBuilder.validateBaseInput({
			emissionType,
			issueDate,
			issuerCnpj: input.issuerCnpj,
			model: input.model,
			serie,
			stateCode: input.stateCode,
		});

		const invoiceNumber = await this.fiscalSequenceService.reserveFiscalNumber({
			model: input.model,
			serie,
		});

		return {
			identity: this.accessKeyBuilder.build({
				emissionType,
				invoiceNumber,
				issueDate,
				issuerCnpj: input.issuerCnpj,
				model: input.model,
				orderNumber: sale.orderNumber,
				serie,
				stateCode: input.stateCode,
			}),
			success: true,
		};
	}
}

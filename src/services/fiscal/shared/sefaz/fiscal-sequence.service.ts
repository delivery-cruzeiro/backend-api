import {
	PrismaFiscalSequenceRepository,
	type FiscalSequenceRepository,
} from '../../../../repositories/fiscal.repository.js';
import { DEFAULT_FISCAL_SERIE, type FiscalDocumentModel } from '../types/fiscal-id.types.js';

export interface ReserveFiscalNumberInput {
	model: FiscalDocumentModel;
	serie?: string;
}

export class FiscalSequenceService {
	constructor(
		private readonly fiscalSequenceRepository: FiscalSequenceRepository = new PrismaFiscalSequenceRepository()
	) {}

	async reserveFiscalNumber(input: ReserveFiscalNumberInput) {
		return this.fiscalSequenceRepository.reserveNextNumber({
			model: input.model,
			serie: input.serie ?? DEFAULT_FISCAL_SERIE,
		});
	}
}

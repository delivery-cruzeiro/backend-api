import { type SubcategoryDTO, type UpdateSubcategoryDTO } from '@delivery-cruzeiro/types';
import type { CatalogImageFile } from '../controllers/catalog-request.utils.js';
import { SubcategoryRepository } from '../repositories/subcategory.repository.js';
import { ensureActiveStoresExist } from './catalog-store.utils.js';
import { uploadImage } from './image-upload.service.js';

type SubcategoryInput = SubcategoryDTO | UpdateSubcategoryDTO;

export class SubcategoryService {
	constructor(private readonly repository = new SubcategoryRepository()) {}

	async createSubcategory(input: SubcategoryDTO, image: CatalogImageFile | null) {
		await this.ensureCategoryExists(input.categoryId);
		await this.ensureUniqueName(input.categoryId, input.name);
		await ensureActiveStoresExist(input.storeIds);

		const imageUrl = await this.resolveImageUrl(input, image);

		return this.repository.create({
			categoryId: input.categoryId,
			description: input.description,
			imageUrl,
			isActive: input.isActive ?? true,
			name: input.name,
			order: input.order ?? 0,
			storeIds: input.storeIds,
		});
	}

	async deleteSubcategory(id: string) {
		const existingSubcategory = await this.repository.findById(id);

		if (!existingSubcategory) {
			throw new Error('Subcategoria nao encontrada');
		}

		await this.repository.delete(id);
	}

	private async ensureCategoryExists(categoryId: string) {
		const category = await this.repository.findCategoryById(categoryId);

		if (!category) {
			throw new Error('Categoria nao encontrada');
		}
	}

	private async ensureUniqueName(categoryId: string, name: string, ignoredId?: string) {
		const subcategoryWithSameName = await this.repository.findByCategoryAndName(
			categoryId,
			name
		);

		if (subcategoryWithSameName && subcategoryWithSameName.id !== ignoredId) {
			throw new Error('Subcategoria ja cadastrada para esta categoria');
		}
	}

	listSubcategories(storeId?: string) {
		return this.repository.list(storeId);
	}

	private async resolveImageUrl(input: SubcategoryInput, image: CatalogImageFile | null) {
		if (!image) {
			return input.imageUrl;
		}

		return uploadImage({
			buffer: image.buffer,
			filename: image.filename,
			folder: 'delivery-cruzeiro/subcategories',
			mimetype: image.mimetype,
		});
	}

	async updateSubcategory(
		id: string,
		input: UpdateSubcategoryDTO,
		image: CatalogImageFile | null
	) {
		const existingSubcategory = await this.repository.findById(id);

		if (!existingSubcategory) {
			throw new Error('Subcategoria nao encontrada');
		}

		const nextCategoryId = input.categoryId ?? existingSubcategory.categoryId;

		if (input.categoryId) {
			await this.ensureCategoryExists(input.categoryId);
		}

		if (input.name || input.categoryId) {
			await this.ensureUniqueName(
				nextCategoryId,
				input.name ?? existingSubcategory.name,
				existingSubcategory.id
			);
		}

		if (input.storeIds !== undefined) {
			await ensureActiveStoresExist(input.storeIds);
		}

		const imageUrl = await this.resolveImageUrl(input, image);

		return this.repository.update(id, {
			...input,
			...(imageUrl && { imageUrl }),
		});
	}
}

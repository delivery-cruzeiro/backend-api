import { type MenuDTO, type UpdateMenuDTO } from '@delivery-cruzeiro/types';
import { MenuRepository } from '../repositories/menu.repository.js';
import { ensureActiveStoresExist } from './catalog-store.utils.js';
import { uploadImage } from './image-upload.service.js';
import type { CatalogImageFile } from '../controllers/catalog-request.utils.js';

type MenuInput = MenuDTO | UpdateMenuDTO;

export class MenuService {
	constructor(private readonly repository = new MenuRepository()) {}

	private async ensureRelationsExist(
		categoryIds?: string[],
		subcategoryIds?: string[],
		storeIds?: string[]
	) {
		if (categoryIds && categoryIds.length > 0) {
			const categoriesCount = await this.repository.countCategoriesByIds(categoryIds);

			if (categoriesCount !== categoryIds.length) {
				throw new Error('Categoria nao encontrada');
			}
		}

		if (subcategoryIds && subcategoryIds.length > 0) {
			const subcategoriesCount =
				await this.repository.countSubcategoriesByIds(subcategoryIds);

			if (subcategoriesCount !== subcategoryIds.length) {
				throw new Error('Subcategoria nao encontrada');
			}
		}

		if (storeIds !== undefined) {
			await ensureActiveStoresExist(storeIds);
		}
	}

	async createMenu(input: MenuDTO, image: CatalogImageFile | null) {
		const existingMenu = await this.repository.findByName(input.name);

		if (existingMenu) {
			throw new Error('Menu ja cadastrado');
		}

		await this.ensureRelationsExist(input.categoryIds, input.subcategoryIds, input.storeIds);

		const imageUrl = await this.resolveImageUrl(input, image, 'menus');

		return this.repository.create({
			categoryIds: input.categoryIds ?? [],
			description: input.description,
			imageUrl,
			isActive: input.isActive ?? true,
			name: input.name,
			order: input.order ?? 0,
			storeIds: input.storeIds,
			subcategoryIds: input.subcategoryIds ?? [],
		});
	}

	async deleteMenu(id: string) {
		const existingMenu = await this.repository.findById(id);

		if (!existingMenu) {
			throw new Error('Menu nao encontrado');
		}

		await this.repository.delete(id);
	}

	listMenus(storeId?: string) {
		return this.repository.list(storeId);
	}

	private async resolveImageUrl(
		input: MenuInput,
		image: CatalogImageFile | null,
		folder: string
	) {
		if (!image) {
			return input.imageUrl;
		}

		return uploadImage({
			buffer: image.buffer,
			filename: image.filename,
			folder: `delivery-cruzeiro/${folder}`,
			mimetype: image.mimetype,
		});
	}

	async updateMenu(id: string, input: UpdateMenuDTO, image: CatalogImageFile | null) {
		const existingMenu = await this.repository.findById(id);

		if (!existingMenu) {
			throw new Error('Menu nao encontrado');
		}

		if (input.name) {
			const menuWithSameName = await this.repository.findByName(input.name);

			if (menuWithSameName && menuWithSameName.id !== id) {
				throw new Error('Menu ja cadastrado');
			}
		}

		await this.ensureRelationsExist(input.categoryIds, input.subcategoryIds, input.storeIds);

		const imageUrl = await this.resolveImageUrl(input, image, 'menus');

		return this.repository.update(id, {
			...input,
			...(imageUrl && { imageUrl }),
		});
	}
}

// Canonical library roots. Storage IDs and existing public URLs remain unchanged.
const directoryAliases: Record<string, string> = {
	categories: 'categorias',
	categorias: 'categorias',
	subcategories: 'subcategorias',
	subcategorias: 'subcategorias',
	products: 'produtos',
	produtos: 'produtos',
	carousel: 'carrossel',
	carousels: 'carrossel',
	carrossel: 'carrossel',
};

export function canonicalImageDirectory(directory: string) {
	const [root, ...children] = directory.split('/');
	const canonicalRoot = Object.hasOwn(directoryAliases, root.toLowerCase())
		? directoryAliases[root.toLowerCase()]
		: root;
	return [canonicalRoot, ...children].join('/');
}

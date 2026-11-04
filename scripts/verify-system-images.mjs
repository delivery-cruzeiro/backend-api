// Exercises only newly-created QA records; never renames/deletes existing assets.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const base = 'http://127.0.0.1:4000/api';
const prefix = '__qa_images_' + Date.now();
let cookie = '';
const images = [];
let categoryId;
let carouselId;
async function request(
	path,
	body,
	method = body === undefined ? 'GET' : 'POST',
	authenticated = true
) {
	const form = body instanceof FormData;
	const response = await fetch(base + path, {
		method,
		headers: {
			origin: process.env.PUBLIC_URL,
			'x-requested-with': 'XMLHttpRequest',
			...(authenticated && cookie ? { cookie } : {}),
			...(!form && body !== undefined ? { 'content-type': 'application/json' } : {}),
		},
		body: body === undefined ? undefined : form ? body : JSON.stringify(body),
	});
	const data = await response.json();
	return {
		status: response.status,
		data,
		cookies: response.headers
			.getSetCookie()
			.map(value => value.split(';')[0])
			.join('; '),
	};
}
function status(result, expected) {
	assert.equal(result.status, expected, JSON.stringify(result.data));
	return result.data;
}
try {
	status(await request('/system-images', undefined, 'GET', false), 401);
	const credentials = process.env.IMAGE_QA_CREDENTIALS
		? JSON.parse(await readFile(process.env.IMAGE_QA_CREDENTIALS))
		: { email: process.env.DEFAULT_ADMIN_EMAIL, password: process.env.DEFAULT_ADMIN_PASSWORD };
	const login = await request('/auth/login', {
		email: credentials.email,
		password: credentials.password,
	});
	status(login, 200);
	cookie = login.cookies;
	const stores = status(await request('/stores'), 200).stores;
	const storeId = stores.find(store => store.isActive).id;
	for (const suffix of ['front', 'back']) {
		const form = new FormData();
		form.set('directory', 'qa/system-images');
		form.set(
			'image',
			new Blob(
				[
					Buffer.from(
						'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j9WQAAAAASUVORK5CYII=',
						'base64'
					),
				],
				{ type: 'image/png' }
			),
			`${prefix}-${suffix}.png`
		);
		images.push(status(await request('/system-images', form), 201).image);
	}
	const urls = images.map(image => image.url);
	const category = status(
		await request('/categories', { name: prefix, storeIds: [storeId], imageUrls: urls }),
		201
	).category;
	categoryId = category.id;
	assert.deepEqual(category.imageUrls, urls);
	const subcategory = status(
		await request('/subcategories', {
			categoryId,
			name: prefix,
			storeIds: [storeId],
			imageUrls: urls,
		}),
		201
	).subcategory;
	assert.deepEqual(subcategory.imageUrls, urls);
	const product = status(
		await request('/products', {
			categoryId,
			subcategoryId: subcategory.id,
			name: prefix,
			description: 'Temporary image library validation',
			price: 1,
			storeIds: [storeId],
			imageUrls: urls,
		}),
		201
	).product;
	assert.deepEqual(product.imageUrls, urls);
	assert.equal(product.imageUrl, urls[0]);
	const carousel = status(
		await request('/carousels', {
			name: prefix,
			storeId,
			content: {
				transition: 'NONE',
				durationSeconds: 5,
				slides: [{ imageUrl: urls[1], html: '' }],
			},
		}),
		201
	).carousel;
	carouselId = carousel.id;
	status(await request(`/system-images/${images[1].id}`, undefined, 'DELETE'), 409);
	const changed = status(
		await request(
			`/system-images/${images[0].id}`,
			{ name: `${prefix}-renamed.png`, directory: 'qa/system-images/nested' },
			'PATCH'
		),
		200
	).image;
	assert.equal(changed.url, urls[0]);
	const listed = status(await request('/system-images?directory=qa%2Fsystem-images'), 200);
	assert.ok(listed.images.some(image => image.id === images[0].id));
	assert.ok(listed.images.find(image => image.id === images[1].id).usage.length >= 4);
	assert.ok(
		status(await request('/system-images?kind=produtos'), 200).images.some(
			image => image.id === images[0].id
		)
	);
	const partial = status(
		await request(`/products/${product.id}`, { description: 'Temporary update' }, 'PUT'),
		200
	).product;
	assert.deepEqual(partial.imageUrls, urls);
	for (const [path, key] of [
		[`/products/${product.id}`, 'product'],
		[`/subcategories/${subcategory.id}`, 'subcategory'],
		[`/categories/${categoryId}`, 'category'],
	]) {
		const cleared = status(await request(path, { imageUrls: [] }, 'PUT'), 200)[key];
		assert.deepEqual(cleared.imageUrls, []);
		assert.equal(cleared.imageUrl, null);
	}
	const invalid = await request(
		`/products/${product.id}`,
		{ imageUrls: ['https://unregistered.example.test/image.png'] },
		'PUT'
	);
	status(invalid, 400);
	const stillStored = status(await request('/system-images?directory=qa%2Fsystem-images'), 200);
	assert.ok(
		stillStored.images.some(image => image.id === images[1].id),
		'Unlinking does not delete the stored file'
	);
	status(await request(`/system-images/${images[1].id}`, undefined, 'DELETE'), 409);
	status(await request(`/carousels/${carouselId}`, undefined, 'DELETE'), 200);
	carouselId = undefined;
	let cursor;
	let imported = 0;
	do {
		const synced = status(await request('/system-images/sync', cursor ? { cursor } : {}), 200);
		imported += synced.imported;
		cursor = synced.nextCursor;
	} while (cursor);
	console.log(
		JSON.stringify({
			result: 'PASS',
			storageImagesSynchronized: imported,
			checks: [
				'unauthenticated access',
				'real Cloudinary upload',
				'nested folders',
				'multiple images in category/subcategory/product',
				'in-use deletion blocked',
				'rename preserves URL',
				'usage filters',
				'partial update preserves references',
				'clearing last image',
				'unknown URLs rejected',
				'unlink preserves file',
				'storage synchronization',
			],
		})
	);
} finally {
	if (carouselId) status(await request(`/carousels/${carouselId}`, undefined, 'DELETE'), 200);
	if (categoryId) status(await request(`/categories/${categoryId}`, undefined, 'DELETE'), 200);
	for (const image of images)
		status(await request(`/system-images/${image.id}`, undefined, 'DELETE'), 200);
	if (images.length) console.log('Temporary QA records and files removed.');
}

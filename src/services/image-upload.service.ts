import { v2 as cloudinary } from 'cloudinary';

export type UploadImageInput = {
	buffer: Buffer;
	filename?: string;
	folder?: string;
	mimetype: string;
};

function configureCloudinary() {
	if (process.env.CLOUDINARY_URL) {
		// dotenv can run after the SDK was imported. Reload its environment config.
		cloudinary.config(true);
		cloudinary.config({ secure: true });
	} else cloudinary.config({
		api_key: process.env.CLOUDINARY_API_KEY,
		api_secret: process.env.CLOUDINARY_API_SECRET,
		cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
		secure: true,
	});
	const configuration = cloudinary.config();
	if (!configuration.cloud_name || !configuration.api_key || !configuration.api_secret) {
		throw new Error('IMAGE_STORAGE_NOT_CONFIGURED: configure CLOUDINARY_URL ou as credenciais CLOUDINARY_* no servidor');
	}
}

function getImageUploadFolder() {
	return process.env.CLOUDINARY_UPLOAD_FOLDER ?? 'delivery-cruzeiro';
}

export async function uploadImage({
	buffer,
	filename,
	folder = getImageUploadFolder(),
	mimetype,
}: UploadImageInput) {
	if (!mimetype.startsWith('image/')) {
		throw new Error('Arquivo enviado nao e uma imagem');
	}

	configureCloudinary();

	return new Promise<string>((resolve, reject) => {
		const stream = cloudinary.uploader.upload_stream(
			{
				folder,
				resource_type: 'image',
				use_filename: Boolean(filename),
				unique_filename: true,
			},
			(error, result) => {
				if (error) {
					reject(error);
					return;
				}

				if (!result?.secure_url) {
					reject(new Error('Cloudinary nao retornou a URL da imagem'));
					return;
				}

				resolve(result.secure_url);
			}
		);

		stream.end(buffer);
	});
}

import { v2 as cloudinary } from 'cloudinary';
import { prisma } from '../lib/prisma.js';
import { canonicalImageDirectory } from './image-directory.utils.js';

export type UploadImageInput = {
	buffer: Buffer;
	filename?: string;
	folder?: string;
	mimetype: string;
};

export function configureCloudinary() {
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
  return cloudinary;
}

export function getImageUploadFolder() {
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
	const root = getImageUploadFolder().replace(/\/+$/, '') + '/';
	const directory = folder.startsWith(root)
		? canonicalImageDirectory(folder.slice(root.length))
		: 'geral';
	const uploadFolder = folder.startsWith(root) ? root + directory : folder;

	return new Promise<string>((resolve, reject) => {
		const stream = cloudinary.uploader.upload_stream(
			{
				folder: uploadFolder,
				resource_type: 'image',
				use_filename: Boolean(filename),
				unique_filename: true,
			},
			async (error, result) => {
				if (error) {
					reject(error);
					return;
				}

				if (!result?.secure_url) {
					reject(new Error('Cloudinary nao retornou a URL da imagem'));
					return;
				}

        try {
          await prisma.systemImage.create({ data: {
            url: result.secure_url, publicId: result.public_id,
            name: filename?.split(/[\\/]/).pop() || result.original_filename || 'Imagem',
            directory,
            width: result.width, height: result.height, bytes: result.bytes,
          } });
          resolve(result.secure_url);
        } catch (metadataError) {
          if (result.public_id) await cloudinary.uploader.destroy(result.public_id).catch(() => {});
          reject(metadataError);
        }
			}
		);

		stream.end(buffer);
	});
}

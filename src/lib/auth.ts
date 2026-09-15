import { betterAuth } from 'better-auth';
import { prisma } from './prisma.js';
import { prismaAdapter } from 'better-auth/adapters/prisma';

const twentyMinutesInSeconds = 60 * 20;
const fiveMinutesInSeconds = 60 * 5;

const localFrontendOrigins = [
	'http://localhost:5173',
	'http://localhost:5174',
	'http://localhost:5175',
	'http://localhost:5176',
	'http://localhost:5177',
	'http://127.0.0.1:5173',
	'http://127.0.0.1:5174',
	'http://127.0.0.1:5175',
	'http://127.0.0.1:5176',
	'http://127.0.0.1:5177',
] as const;

const trustedOrigins = [
	...(process.env.CORS_ORIGIN ?? '')
	.split(',')
	.map(origin => origin.trim())
	.filter(Boolean),
	...localFrontendOrigins,
].filter((origin, index, origins) => origins.indexOf(origin) === index);

type AuthEmailPayload = {
	user: {
		email: string;
	};
	url: string;
};

export const auth = betterAuth({
	baseURL: process.env.BETTER_AUTH_URL ?? 'http://localhost:4000',
	secret: process.env.BETTER_AUTH_SECRET,
	trustedOrigins,
	database: prismaAdapter(prisma, {
		provider: 'postgresql',
	}),
	user: {
		fields: {
			image: 'avatar',
		},
		additionalFields: {
			phone: {
				type: 'string',
				required: false,
				input: true,
			},
			role: {
				type: 'string',
				required: false,
				input: false,
				defaultValue: 'CLIENT',
				returned: true,
			},
			isActive: {
				type: 'boolean',
				required: false,
				input: false,
				defaultValue: true,
				returned: true,
			},
		},
	},
	emailAndPassword: {
		enabled: true,
		requireEmailVerification: false,
		sendResetPassword: async ({ user, url }: AuthEmailPayload) => {
			// TODO: Implementar envio de email de reset de senha
			console.warn('Enviar email de reset de senha para:', user.email, 'URL:', url);
		},
		sendVerificationEmail: async ({ user, url }: AuthEmailPayload) => {
			// TODO: Implementar envio de email de verificação
			console.warn('Enviar email de verificação para:', user.email, 'URL:', url);
		},
	},
	session: {
		expiresIn: twentyMinutesInSeconds,
		updateAge: fiveMinutesInSeconds,
		freshAge: fiveMinutesInSeconds,
	},
	advanced: {
		cookiePrefix: 'delivery-cruzeiro',
		crossSubDomainCookies: {
			enabled: false,
		},
	},
	socialProviders: {
		// Configurar providers sociais futuramente (Google, Facebook, etc.)
	},
});

export type Session = typeof auth.$Infer.Session;

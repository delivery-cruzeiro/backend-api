import { securityConfig } from '../security/config.js';
import { betterAuth } from 'better-auth';
import { prisma } from './prisma.js';
import { prismaAdapter } from 'better-auth/adapters/prisma';

const twentyMinutesInSeconds = 60 * 20;
const fiveMinutesInSeconds = 60 * 5;

const config = securityConfig();

export const auth = betterAuth({
	baseURL: config.baseURL,
	secret: process.env.BETTER_AUTH_SECRET,
	trustedOrigins: config.origins,
	database: prismaAdapter(prisma, {
		provider: 'postgresql',
	}),
	user: {
		fields: {
			image: 'avatar',
		},
		additionalFields: {
			cpf: { type: 'string', required: false, input: true, returned: false },
			phone: {
				type: 'string',
				required: true,
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
		minPasswordLength: 8,
		maxPasswordLength: 128,
	},
	session: {
		expiresIn: twentyMinutesInSeconds,
		updateAge: fiveMinutesInSeconds,
		freshAge: fiveMinutesInSeconds,
		cookieCache: {enabled:false},
	},
	advanced: {
		cookiePrefix: 'delivery-cruzeiro',
		useSecureCookies: config.secureCookies,
		defaultCookieAttributes: {httpOnly:true, secure:config.secureCookies, sameSite:'lax', path:'/'},
		crossSubDomainCookies: {
			enabled: false,
		},
	},
	socialProviders: {
		// Configurar providers sociais futuramente (Google, Facebook, etc.)
	},
});

export type Session = typeof auth.$Infer.Session;

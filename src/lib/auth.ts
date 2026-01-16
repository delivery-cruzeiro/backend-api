import { betterAuth } from 'better-auth';
import { prisma } from './prisma.js';
import { prismaAdapter } from 'better-auth/adapters/prisma';

export const auth = betterAuth({
  database: prismaAdapter(prisma, {
    provider: 'postgresql',
  }),
  emailAndPassword: {
    enabled: true,
    requireEmailVerification: false,
    sendResetPassword: async ({ user, url }: { user: any; url: string }) => {
      // TODO: Implementar envio de email de reset de senha
      console.log('Enviar email de reset de senha para:', user.email, 'URL:', url);
    },
    sendVerificationEmail: async ({ user, url }: { user: any; url: string }) => {
      // TODO: Implementar envio de email de verificação
      console.log('Enviar email de verificação para:', user.email, 'URL:', url);
    },
  },
  session: {
    expiresIn: 60 * 60 * 24 * 7, // 7 dias
    updateAge: 60 * 60 * 24, // 1 dia
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

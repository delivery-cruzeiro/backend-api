import pkg from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg'; 

/**
 * Configuração do Prisma Client
 *
 * Esta configuração segue as novas diretrizes do Prisma 7+:
 * - A URL do banco de dados é definida via variável de ambiente DATABASE_URL
 * - O accelerateUrl é necessário para usar o engine type "client" no Prisma 7+
 */

const { PrismaClient } = pkg;

// Instância do PrismaClient com accelerateUrl vazio para usar engine type "client"
const globalForPrisma = global as unknown as { prisma: typeof PrismaClient.prototype };
const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });

export const prisma = globalForPrisma.prisma || new PrismaClient({
  adapter
});

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}

// Função para desconectar o PrismaClient (útil em testes ou shutdown)
export async function disconnectPrisma() {
  await prisma.$disconnect();
}

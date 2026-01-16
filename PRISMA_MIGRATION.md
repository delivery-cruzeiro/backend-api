# Migração para Prisma 7+

Este documento descreve as mudanças realizadas para migrar o projeto para o Prisma 7+.

## Resumo das Mudanças

### 1. Arquivo `prisma/schema.prisma`

**Antes:**
```prisma
datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}
```

**Depois:**
```prisma
datasource db {
  provider = "postgresql"
}
```

**Motivo:** No Prisma 7+, a propriedade `url` no bloco `datasource` foi descontinuada. A URL do banco de dados agora deve ser configurada no arquivo `prisma.config.ts`.

### 2. Arquivo `prisma.config.ts`

Este arquivo já existe e está configurado corretamente:

```typescript
export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  engine: "classic",
  datasource: {
    url: env("DATABASE_URL"),
  },
});
```

### 3. Arquivo `src/lib/prisma.ts` (NOVO)

Criado um novo arquivo para inicialização do PrismaClient com o adapter PostgreSQL:

```typescript
import { PrismaClient } from '@prisma/client';
import { Pool } from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

const adapter = new PrismaPg(pool);

export const prisma = new PrismaClient({
  adapter,
});

export async function disconnectPrisma() {
  await prisma.$disconnect();
  await pool.end();
}
```

## Como Usar

### Importar e usar o PrismaClient

```typescript
import { prisma } from './lib/prisma';

// Exemplo de uso
const users = await prisma.user.findMany();
const user = await prisma.user.create({
  data: {
    email: 'user@example.com',
    password: 'hashedpassword',
    name: 'John Doe',
  },
});
```

### Em testes ou shutdown

```typescript
import { disconnectPrisma } from './lib/prisma';

// Ao finalizar testes
afterAll(async () => {
  await disconnectPrisma();
});

// Ao desligar a aplicação
process.on('SIGTERM', async () => {
  await disconnectPrisma();
  process.exit(0);
});
```

## Scripts Disponíveis

- `pnpm prisma:generate` - Gera o PrismaClient
- `pnpm prisma:migrate` - Cria e aplica migrações
- `pnpm prisma:push` - Sincroniza o schema com o banco (sem migrações)
- `pnpm prisma:studio` - Abre o Prisma Studio

## Variáveis de Ambiente

Certifique-se de que a variável `DATABASE_URL` está configurada no arquivo `.env`:

```
DATABASE_URL="postgresql://user:password@localhost:5432/database_name"
```

## Benefícios da Nova Configuração

1. **Separação de responsabilidades:** A configuração do datasource está isolada em `prisma.config.ts`
2. **Melhor controle de conexões:** Usamos um pool de conexões PostgreSQL explícito
3. **Compatibilidade com Prisma 7+:** Segue as novas diretrizes oficiais
4. **Flexibilidade:** Permite fácil integração com Prisma Accelerate se necessário

## Referências

- [Prisma 7 Configuração de Datasource](https://pris.ly/d/config-datasource)
- [Prisma 7 Client Config](https://pris.ly/d/prisma7-client-config)
- [Prisma Adapter PostgreSQL](https://www.prisma.io/docs/reference/api-reference/prisma-postgres)

# Implementação de Autenticação com Better Auth

## Visão Geral

Este documento descreve a implementação do sistema de autenticação utilizando **Better Auth** no backend do Delivery Cruzeiro, seguindo a Fase 2.2 do plano de desenvolvimento.

## Estrutura de Arquivos

```
backend-api/
├── src/
│   ├── lib/
│   │   └── auth.ts                    # Configuração do Better Auth
│   ├── controllers/
│   │   ├── auth.controller.ts           # Controladores de autenticação
│   │   └── user.controller.ts           # Controladores de usuários
│   ├── routes/
│   │   ├── auth.routes.ts               # Rotas de autenticação
│   │   └── user.routes.ts               # Rotas de usuários
│   └── middleware/
│       └── auth.middleware.ts            # Middleware de autenticação
├── prisma/
│   └── schema.prisma                   # Schema do banco de dados
└── tests/
    └── unit/
        ├── auth.test.ts                  # Testes de autenticação
        └── user.test.ts                  # Testes de usuários
```

## Configuração do Better Auth

### Arquivo: `src/lib/auth.ts`

O Better Auth foi configurado com as seguintes funcionalidades:

- **Email & Password**: Autenticação tradicional com email e senha
- **Sessões**: Sessões com duração de 7 dias
- **Adapter Prisma**: Integração direta com Prisma ORM
- **Cookies**: Prefixo configurado como `delivery-cruzeiro`

### Configuração

```typescript
export const auth = betterAuth({
  database: prismaAdapter(prisma, {
    provider: 'postgresql',
  }),
  emailAndPassword: {
    enabled: true,
    requireEmailVerification: false,
    sendResetPassword: async ({ user, url }) => {
      // TODO: Implementar envio de email de reset de senha
      console.log('Enviar email de reset de senha para:', user.email, 'URL:', url);
    },
    sendVerificationEmail: async ({ user, url }) => {
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
});
```

## Modelo de Usuário

### Arquivo: `prisma/schema.prisma`

O modelo [`User`](backend-api/prisma/schema.prisma:16) foi atualizado para incluir campos necessários para o Better Auth:

```prisma
model User {
  id            String         @id @default(cuid())
  email         String         @unique
  emailVerified DateTime?
  password      String?
  name          String
  phone         String?
  avatar        String?
  role          UserRole       @default(CLIENT)
  isActive      Boolean        @default(true)
  createdAt     DateTime       @default(now())
  updatedAt     DateTime       @updatedAt
  
  // Relações
  addresses     Address[]
  paymentMethods PaymentMethod[]
  orders        Order[]
  notifications Notification[]
  points        Point[]
  reviews       Review[]
  favorites     Favorite[]
  
  // Better Auth fields
  accounts      Account[]
  sessions      Session[]
  
  @@index([email])
  @@index([role])
}

model Account {
  id                String  @id @default(cuid())
  userId            String
  type              String
  provider          String
  providerAccountId String
  refresh_token     String?
  access_token      String?
  expires_at        Int?
  token_type        String?
  scope             String?
  id_token          String?
  session_state     String?

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@unique([provider, providerAccountId])
  @@index([userId])
}

model Session {
  id           String   @id @default(cuid())
  sessionToken String   @unique
  userId       String
  expires      DateTime
  user         User     @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([userId])
}

enum UserRole {
  CLIENT
  ADMIN
  MANAGER
  SUPER_ADMIN
}
```

## Endpoints de Autenticação

### Rotas Padrão Better Auth

O Better Auth fornece endpoints padrão que são roteados através do Fastify:

- `POST /api/auth/sign-up/email` - Registro de usuário
- `POST /api/auth/sign-in/email` - Login com email e senha
- `POST /api/auth/sign-out` - Logout
- `GET /api/auth/get-session` - Obter sessão atual

### Rotas Customizadas

#### Registro de Usuário

**Endpoint**: `POST /api/auth/register`

**Body**:
```json
{
  "email": "user@example.com",
  "password": "password123",
  "name": "Nome do Usuário",
  "phone": "11999999999"
}
```

**Response** (201):
```json
{
  "message": "Usuário criado com sucesso",
  "user": {
    "id": "clxxxxxxx",
    "email": "user@example.com",
    "name": "Nome do Usuário",
    "phone": "11999999999",
    "role": "CLIENT",
    "isActive": true,
    "emailVerified": null,
    "createdAt": "2026-01-14T14:00:00.000Z"
  }
}
```

#### Login

**Endpoint**: `POST /api/auth/login`

**Body**:
```json
{
  "email": "user@example.com",
  "password": "password123"
}
```

**Response** (200):
```json
{
  "message": "Login realizado com sucesso",
  "user": {
    "id": "clxxxxxxx",
    "email": "user@example.com",
    "name": "Nome do Usuário",
    "role": "CLIENT",
    "isActive": true
  },
  "session": {
    "token": "...",
    "expiresAt": "2026-01-21T14:00:00.000Z"
  }
}
```

#### Logout

**Endpoint**: `POST /api/auth/logout`

**Response** (200):
```json
{
  "message": "Logout realizado com sucesso"
}
```

#### Obter Usuário Atual

**Endpoint**: `GET /api/auth/me`

**Response** (200):
```json
{
  "user": {
    "id": "clxxxxxxx",
    "email": "user@example.com",
    "name": "Nome do Usuário",
    "role": "CLIENT"
  }
}
```

#### Refresh Token

**Endpoint**: `POST /api/auth/refresh`

**Response** (200):
```json
{
  "session": {
    "token": "...",
    "expiresAt": "2026-01-21T14:00:00.000Z"
  }
}
```

## Rota /api/new-user

### Endpoint: `POST /api/new-user`

Esta rota permite criar um novo usuário diretamente no banco de dados, conforme solicitado.

**Body**:
```json
{
  "email": "novo@example.com",
  "password": "password123",
  "name": "Novo Usuário",
  "phone": "11999999999",
  "role": "CLIENT"
}
```

**Campos**:
- `email` (obrigatório): Email válido do usuário
- `password` (obrigatório): Senha com mínimo de 6 caracteres
- `name` (obrigatório): Nome completo do usuário
- `phone` (opcional): Número de telefone
- `role` (opcional): Papel do usuário (CLIENT, ADMIN, MANAGER, SUPER_ADMIN). Padrão: CLIENT

**Validações**:
- Email deve ter formato válido
- Senha deve ter pelo menos 6 caracteres
- Email não pode já estar cadastrado

**Response** (201):
```json
{
  "message": "Usuário criado com sucesso",
  "user": {
    "id": "clxxxxxxx",
    "email": "novo@example.com",
    "name": "Novo Usuário",
    "phone": "11999999999",
    "avatar": null,
    "role": "CLIENT",
    "isActive": true,
    "emailVerified": null,
    "createdAt": "2026-01-14T14:00:00.000Z",
    "updatedAt": "2026-01-14T14:00:00.000Z"
  }
}
```

**Erros**:
- `400`: Campos obrigatórios faltando ou inválidos
- `409`: Email já cadastrado

## Sistema de Roles

O sistema implementa 4 níveis de permissões:

### Roles Definidos

1. **CLIENT**: Cliente comum do sistema
2. **ADMIN**: Administrador com permissões de gerenciamento
3. **MANAGER**: Gerente com permissões de aprovação de pedidos
4. **SUPER_ADMIN**: Super administrador com todas as permissões

### Middleware de Permissões

#### Autenticação Básica

```typescript
import { authenticate } from '../middleware/auth.middleware';

// Verifica se o usuário está autenticado
fastify.get('/protected', { preHandler: authenticate }, handler);
```

#### Verificação de Roles

```typescript
import { requireAdmin, requireManager, requireSuperAdmin } from '../middleware/auth.middleware';

// Apenas ADMIN e SUPER_ADMIN
fastify.get('/admin', { preHandler: requireAdmin }, handler);

// Apenas MANAGER, ADMIN e SUPER_ADMIN
fastify.get('/manager', { preHandler: requireManager }, handler);

// Apenas SUPER_ADMIN
fastify.get('/super-admin', { preHandler: requireSuperAdmin }, handler);
```

#### Middleware Customizado

```typescript
import { requireRole } from '../middleware/auth.middleware';

// Roles específicos
fastify.get('/custom', { 
  preHandler: requireRole('ADMIN', 'MANAGER') 
}, handler);
```

## Outras Rotas de Usuários

### Listar Todos os Usuários

**Endpoint**: `GET /api/users`

**Response** (200):
```json
{
  "users": [
    {
      "id": "clxxxxxxx",
      "email": "user@example.com",
      "name": "Nome do Usuário",
      "role": "CLIENT",
      "isActive": true,
      "createdAt": "2026-01-14T14:00:00.000Z"
    }
  ],
  "total": 1
}
```

### Buscar Usuário por ID

**Endpoint**: `GET /api/users/:id`

**Response** (200):
```json
{
  "user": {
    "id": "clxxxxxxx",
    "email": "user@example.com",
    "name": "Nome do Usuário",
    "role": "CLIENT",
    "addresses": [],
    "paymentMethods": [],
    "orders": []
  }
}
```

### Atualizar Usuário

**Endpoint**: `PUT /api/users/:id`

**Body**:
```json
{
  "name": "Nome Atualizado",
  "phone": "11888888888",
  "role": "ADMIN"
}
```

**Response** (200):
```json
{
  "message": "Usuário atualizado com sucesso",
  "user": {
    "id": "clxxxxxxx",
    "email": "user@example.com",
    "name": "Nome Atualizado",
    "phone": "11888888888",
    "role": "ADMIN"
  }
}
```

### Deletar Usuário

**Endpoint**: `DELETE /api/users/:id`

**Response** (200):
```json
{
  "message": "Usuário deletado com sucesso"
}
```

## Segurança

### Hash de Senhas

Todas as senhas são hasheadas usando **bcryptjs** com salt rounds de 10:

```typescript
const hashedPassword = await bcrypt.hash(password, 10);
```

### Validações

- Email: Validação de formato com regex
- Senha: Mínimo de 6 caracteres
- Email único: Verificação antes de criar/atualizar

### Rate Limiting

Configurado no Fastify:
- Máximo: 100 requisições por janela
- Janela: 1 minuto

### CORS

Configurado para permitir credenciais e origem configurável via variável de ambiente.

## Testes

### Testes de Autenticação

Arquivo: `tests/unit/auth.test.ts`

Cobertura:
- Registro de usuário
- Login com credenciais válidas
- Login com credenciais inválidas
- Usuário desativado
- Logout
- Obter usuário atual
- Refresh token

### Testes de Usuários

Arquivo: `tests/unit/user.test.ts`

Cobertura:
- Criar usuário
- Validações de campos
- Email já cadastrado
- Hash de senha
- Listar usuários
- Buscar usuário por ID
- Atualizar usuário
- Deletar usuário

### Executar Testes

```bash
cd backend-api
npm test
```

## Variáveis de Ambiente

### Configurações Necessárias

```env
# Database
DATABASE_URL="postgresql://postgres:password@localhost:5432/delivery_cruzeiro?schema=public"

# Server
PORT=4000
HOST=0.0.0.0
NODE_ENV=development
LOG_LEVEL=info

# CORS
CORS_ORIGIN=*

# JWT
JWT_SECRET="your-super-secret-jwt-key-change-in-production"
JWT_EXPIRES_IN="7d"

# Better Auth
BETTER_AUTH_SECRET="your-better-auth-secret-change-in-production"
BETTER_AUTH_URL="http://localhost:4000"
```

## Próximos Passos

Conforme o plano de desenvolvimento, os próximos passos são:

1. **Fase 2.3**: API Routes Base
   - Implementar sistema de validação de dados (Zod)
   - Criar middleware de tratamento de erros
   - Implementar sistema de logging

2. **Fase 3**: Frontend Core e Atomic Design
   - Criar estrutura de componentes Atomic Design
   - Configurar Zustand para state management
   - Implementar sistema de rotas

3. **Fase 4**: Funcionalidades de Usuário Não Logado
   - Página de cardápio
   - Sistema de carrinho de compras
   - Promoções e destaques

## Notas Importantes

1. **Banco de Dados**: O banco de dados PostgreSQL deve estar rodando para executar as migrations
2. **Migrations**: Execute `npx prisma db push` para aplicar as mudanças no schema
3. **Better Auth**: O Better Auth gerencia automaticamente sessões e cookies
4. **Segurança**: Nunca commitar `.env` com secrets reais
5. **Testes**: Mantenha cobertura de testes >= 80%

## Troubleshooting

### Erro: Cannot reach database server

Certifique-se de que o PostgreSQL está rodando e a `DATABASE_URL` está correta.

### Erro: Email já cadastrado

Este é um erro esperado (409) quando tentar criar um usuário com email que já existe.

### Erro: Credenciais inválidas

Verifique se a senha está correta e o usuário existe no banco de dados.

### Erro: Usuário desativado

O usuário existe mas está marcado como `isActive: false`. Um admin deve reativar o usuário.

---

**Versão**: 1.0  
**Data**: 14/01/2026  
**Autor**: Kilo Code

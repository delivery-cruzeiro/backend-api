# Delivery Cruzeiro API

API do sistema Delivery Cruzeiro, construída com Node.js, TypeScript, Prisma ORM e PostgreSQL.

## Stack Tecnológica

- **Runtime**: Node.js 22
- **Linguagem**: TypeScript 5.9
- **ORM**: Prisma 6.19.2
- **Banco de Dados**: PostgreSQL 16
- **Package Manager**: pnpm

## Estrutura do Projeto

```
backend-api/
├── prisma/
│   ├── schema.prisma       # Schema do banco de dados
│   ├── migrations/          # Migrations do Prisma
│   └── prisma.config.ts    # Configuração do Prisma
├── src/
│   ├── controllers/         # Controladores da API
│   ├── middleware/         # Middleware (autenticação, validação)
│   ├── repositories/       # Repositórios (acesso ao banco)
│   ├── routes/            # Rotas da API
│   ├── services/           # Serviços (regras de negócio)
│   ├── types/             # Tipos TypeScript
│   ├── utils/             # Utilitários
│   └── index.ts           # Entry point da aplicação
├── tests/
│   ├── unit/              # Testes unitários
│   ├── integration/        # Testes de integração
│   └── e2e/               # Testes end-to-end
├── Dockerfile             # Configuração do Docker
├── docker-compose.yml     # Orquestração de containers
└── package.json           # Dependências e scripts
```

## Variáveis de Ambiente

Crie um arquivo `.env` baseado no `.env.example`:

```env
# Database
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/delivery_cruzeiro?schema=public"

# Server
PORT=4000
NODE_ENV=development

# JWT
JWT_SECRET="your-super-secret-jwt-key-change-in-production"
JWT_EXPIRES_IN="7d"

# Better Auth
BETTER_AUTH_SECRET="your-better-auth-secret-change-in-production"
BETTER_AUTH_URL="http://localhost:4000"

# AbacatePay
ABACATEPAY_API_KEY="your-abacatepay-api-key"
ABACATEPAY_API_URL="https://api.abacatepay.com.br"

# Email (SMTP)
SMTP_HOST="smtp.example.com"
SMTP_PORT=587
SMTP_USER="your-email@example.com"
SMTP_PASS="your-smtp-password"
SMTP_FROM="noreply@deliverycruzeiro.com"

# WhatsApp
WHATSAPP_API_URL="https://api.whatsapp-service.com"
WHATSAPP_API_KEY="your-whatsapp-api-key"
WHATSAPP_PHONE_NUMBER="5511999999999"

# CORS
FRONTEND_URL="http://localhost:3000"
```

## Scripts Disponíveis

```bash
# Instalar dependências
pnpm install

# Gerar Prisma Client
pnpm run prisma:generate

# Criar e aplicar migration
pnpm run prisma:migrate

# Push do schema para o banco (sem migration)
pnpm run prisma:push

# Abrir Prisma Studio
pnpm run prisma:studio

# Executar seed do banco
pnpm run prisma:seed

# Desenvolvimento (com hot reload)
pnpm run dev

# Build para produção
pnpm run build

# Executar em produção
pnpm run start
```

> **Nota Importante**: O Prisma Client é gerado automaticamente no runtime quando o container inicia (via `docker-compose.yml`), então não é necessário executar `pnpm run prisma:generate` manualmente antes de subir os containers.

## Docker

### Usando Docker Compose

A maneira mais simples de rodar a aplicação com o PostgreSQL:

```bash
# Subir os containers (PostgreSQL e API)
docker-compose up -d

# Ver logs
docker-compose logs -f

# Parar os containers
docker-compose down

# Parar e remover volumes
docker-compose down -v
```

O Docker Compose vai:
1. Subir um container PostgreSQL na porta 5432
2. Subir a API Node.js na porta 4000
3. Aguardar o PostgreSQL estar saudável antes de iniciar a API
4. Persistir os dados do PostgreSQL em um volume Docker

### Build da Imagem Docker

Para construir a imagem Docker manualmente:

```bash
# Build da imagem
docker build -t delivery-cruzeiro-api .

# Executar o container
docker run -p 4000:4000 \
  -e DATABASE_URL="postgresql://postgres:postgres@host.docker.internal:5432/delivery_cruzeiro?schema=public" \
  delivery-cruzeiro-api
```

## Configuração do Prisma

O projeto usa a nova configuração do Prisma 6.x:

- **[`prisma.config.ts`](prisma.config.ts)**: Configuração do datasource e migrations
- **[`prisma/schema.prisma`](prisma/schema.prisma)**: Definição dos modelos do banco

O `DATABASE_URL` é definido no `prisma.config.ts` e lido do arquivo `.env`.

## Modelos do Banco de Dados

O schema inclui os seguintes modelos:

- **User** - Usuários do sistema (clientes, admins, gerentes)
- **Address** - Endereços de entrega
- **PaymentMethod** - Métodos de pagamento
- **Category** - Categorias de produtos
- **Product** - Produtos do cardápio
- **Order** - Pedidos
- **OrderItem** - Itens do pedido
- **Payment** - Pagamentos
- **Promotion** - Promoções
- **PromotionProduct** - Relação promoção-produto
- **SystemSettings** - Configurações do sistema
- **DeliveryZone** - Zonas de entrega
- **Notification** - Notificações
- **Point** - Pontos de fidelidade
- **Review** - Avaliações de produtos
- **Favorite** - Produtos favoritos

Consulte [`prisma/schema.prisma`](prisma/schema.prisma) para a definição completa.

## Desenvolvimento

### Pré-requisitos

- Node.js >= 22.0.0
- pnpm >= 10.0.0
- PostgreSQL (opcional, pode usar Docker)

### Setup Local

```bash
# Clonar o repositório
git clone git@github.com:delivery-cruzeiro/backend-api.git
cd backend-api

# Instalar dependências
pnpm install

# Copiar arquivo de exemplo
cp .env.example .env

# Editar o .env com suas configurações
nano .env

# Gerar Prisma Client
pnpm run prisma:generate

# Aplicar migrations (se necessário)
pnpm run prisma:migrate

# Iniciar em modo desenvolvimento
pnpm run dev
```

A API estará disponível em `http://localhost:4000`.

## Produção

### Build

```bash
# Build do TypeScript
pnpm run build

# A saída estará em dist/
```

### Deploy com Docker

```bash
# Build da imagem
docker build -t delivery-cruzeiro-api:latest .

# Push para registry
docker push delivery-cruzeiro-api:latest

# Deploy (exemplo com docker-compose)
docker-compose -f docker-compose.prod.yml up -d
```

## Testes

```bash
# Executar testes unitários
pnpm test:unit

# Executar testes de integração
pnpm test:integration

# Executar testes E2E
pnpm test:e2e

# Executar todos os testes com coverage
pnpm test --coverage
```

## Troubleshooting

### Erro de conexão com o banco

Verifique se o `DATABASE_URL` no `.env` está correto:

```env
# Para Docker Compose
DATABASE_URL="postgresql://postgres:postgres@postgres:5432/delivery_cruzeiro?schema=public"

# Para banco local
DATABASE_URL="postgresql://postgres:password@localhost:5432/delivery_cruzeiro?schema=public"
```

### Prisma Client não encontrado

Execute o comando de generate:

```bash
pnpm run prisma:generate
```

### Erros de permissão no Docker

No Windows, verifique se o Docker Desktop está rodando e se o compartilhamento de arquivos está habilitado.

## Licença

MIT

## Autor

Kilo Code

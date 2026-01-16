#!/bin/sh
set -e

echo "========================================="
echo "Delivery Cruzeiro API - Entrypoint"
echo "========================================="

# PostgreSQL já está pronto devido ao depends_on com healthcheck no docker-compose.yml
echo "✓ PostgreSQL está pronto (garantido pelo Docker Compose)"

# Generate Prisma Client no runtime (quando DATABASE_URL já está disponível)
echo "Gerando Prisma Client..."
pnpm run prisma:generate

# Aplicar migrations usando prisma migrate deploy
# Este comando aplica apenas migrations que ainda não foram aplicadas
echo "Aplicando migrations do Prisma..."
pnpm run prisma:deploy

echo "✓ Migrations aplicadas com sucesso!"

# Iniciar a aplicação
echo "Iniciando a aplicação..."
echo "========================================="
exec "$@"

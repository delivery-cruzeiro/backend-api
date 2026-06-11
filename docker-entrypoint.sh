#!/bin/sh
set -e

echo "========================================="
echo "Delivery Cruzeiro API - Entrypoint"
echo "========================================="

if [ -z "$DATABASE_URL" ]; then
	echo "DATABASE_URL nao foi definida."
	exit 1
fi

echo "Prisma Client ja foi gerado no build da imagem."

if [ "${PRISMA_DEPLOY_MIGRATIONS:-true}" = "true" ]; then
	echo "Aplicando migrations do Prisma..."
	./node_modules/.bin/prisma migrate deploy
	echo "Migrations aplicadas com sucesso."
else
	echo "PRISMA_DEPLOY_MIGRATIONS=false; pulando migrations."
fi

echo "Iniciando a aplicacao..."
echo "========================================="
exec "$@"

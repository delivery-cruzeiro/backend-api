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

case "${PRISMA_SCHEMA_SYNC_MODE:-push}" in
	push)
		echo "Sincronizando schema do Prisma com db push..."
		./node_modules/.bin/prisma db push
		echo "Schema sincronizado com sucesso."
		;;
	migrate)
		echo "Aplicando migrations do Prisma..."
		./node_modules/.bin/prisma migrate deploy
		echo "Migrations aplicadas com sucesso."
		;;
	none)
		echo "PRISMA_SCHEMA_SYNC_MODE=none; pulando sincronizacao do schema."
		;;
	*)
		echo "PRISMA_SCHEMA_SYNC_MODE invalido: ${PRISMA_SCHEMA_SYNC_MODE}"
		echo "Use push, migrate ou none."
		exit 1
		;;
esac

if [ "${PRISMA_DEPLOY_MIGRATIONS:-}" = "false" ]; then
	echo "Aviso: PRISMA_DEPLOY_MIGRATIONS=false foi substituido por PRISMA_SCHEMA_SYNC_MODE=none."
fi

echo "Iniciando a aplicacao..."
echo "========================================="
exec "$@"

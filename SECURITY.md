# Segurança da API

Use a API 1.2.0 com a configuração do Infra 0.3.0. A aplicação recusa em produção uma conexão de banco que não use a role restrita delivery_app e exige DATA_ENCRYPTION_KEY e BETTER_AUTH_SECRET válidas.

O processo de migration usa a credencial administrativa apenas para migrations e provisionamento. A API usa outra senha, APP_DB_PASSWORD. Requests de negócio devem utilizar o Prisma exportado de src/lib/prisma.ts, que mantém a identidade em transações, aplica criptografia e respeita RLS. Não instancie clientes adicionais nem faça consultas SQL nas rotas.

Requests autenticados devem passar por authenticate/guards antes de consultas privadas. As políticas de propriedade complementam os guards; não substituem autorização de administrador. Novas tabelas precisam de ENABLE/FORCE RLS e políticas explícitas na migration. O contexto system é reservado a tarefas internas fora de requests.

Não adicione senhas, tokens, chaves ou certificados ao Git. Certificados são provisionados em /run/secrets, nunca procurados nas fontes. Uma credencial que já foi publicada precisa ser revogada, além da limpeza do histórico.

Para atualização de dados, HTTPS, configuração fiscal e a matriz dos 20 controles, consulte [a documentação do Infra](https://github.com/delivery-cruzeiro/Infra/blob/main/SECURITY.md).

Validação: `docker build --target verification .`. O script `scripts/security-smoke.mjs` é destinado exclusivamente a um banco descartável; cria contas sintéticas e verifica os limites HTTP, RLS, sessões e criptografia contra a aplicação em execução. Os scripts de backfill e migration não devem ser executados sem backup.

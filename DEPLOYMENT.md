# Release 1.2.0

Este repositório é autossuficiente para build. Requer somente Docker; não use a instalação Node da máquina nem um workspace externo.

Execute `docker build .`. O Docker instala a versão fixa do pnpm e valida pnpm-lock.yaml. Bibliotecas internas vêm de arquivos npm versionados em vendor/, nunca de links para outras pastas.

A tag v<versão> deve coincidir com VERSION e package.json. O workflow publica ghcr.io/delivery-cruzeiro/backend-api:<versão>. O repositório Infra escolhe a versão em execução; publicar não atualiza automaticamente produção.

Para testes, construa o estágio dependencies e execute em um container descartável com as fontes copiadas para /app. Não monte node_modules do host. As configurações integradas de banco, gateway, HTTPS e rotas estão no repositório Infra.

Pacotes em vendor são distribuições compiladas das bibliotecas: preservam uma versão por consumidor e permitem um clone independente mesmo sem acesso a um registry privado. Use somente artefatos produzidos pelo repositório da biblioteca; não edite o conteúdo de um tarball existente.

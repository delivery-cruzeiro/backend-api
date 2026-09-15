# delivery-cruzeiro-api

Release 1.1.0. Repositório independente: não exige pastas vizinhas nem Node/pnpm na máquina hospedeira.

O build, os testes e a geração de artefatos rodam dentro de Docker. Consulte [DEPLOYMENT.md](DEPLOYMENT.md) para os comandos.

Para executar o sistema inteiro em um servidor, use o repositório [Infra](https://github.com/delivery-cruzeiro/Infra), que fixa a versão de cada imagem e coordena gateway, banco e aplicações. Publicar esta release não atualiza automaticamente os demais subsistemas.

A documentação anterior foi preservada em docs/legacy/README.md para consulta histórica. As instruções de instalação antigas não se aplicam a esta release.

# Base local CNEFE e fallback Nominatim

O checkout usa o serviço de localização existente. A composição padrão consulta CNEFE local e, se não houver evidência adequada, Nominatim pela fila global. Não há download de arquivos do IBGE no caminho de um pedido.

## Componentes

- `CnefeGeocodingRepository`: versão ativa por cidade/UF e busca indexada por dataset, CEP, rua e número/modificador. Agrupa unidades repetidas por coordenada e nível.
- `CnefeGeocodingProvider`: níveis 1/2, dispersão dos candidatos, escolha de um ponto real da fonte e metadados de qualidade.
- `FallbackGeocodingProvider`: composição independente da loja, com callback opcional de aceitação do resultado.
- `AddressGeocodingService`: validação, persistência de origem/versão/qualidade, concorrência e cache. A chave inclui checksum da base e escopo da loja.
- `DeliveryAreaService`: continua decidindo a divisão. A proteção de precisão verifica o afastamento dos contornos; resultados inadequados voltam à composição para tentar o próximo provedor.

O índice é de dados públicos. Não há chave estrangeira entre os registros CNEFE e os endereços de clientes. `delivery_app` tem somente leitura das tabelas de referência; importação usa a conexão administrativa do serviço `migrate`.

## Qualidade e limites

A busca exige município, CEP, logradouro e número/modificador. Não aceita outro CEP/localidade silenciosamente. O repositório retorna apenas níveis 1 e 2. O provedor recusa mais de 64 grupos ou dispersão superior a 25 metros.

O ponto escolhido vem de um registro da fonte, preferindo nível 1. A margem para os cortes é `ceil(30 + dispersão_em_metros)`. O valor de 30 metros é uma proteção operacional conservadora, não uma precisão garantida pelo IBGE. O nível de geocodificação, a idade da base e possíveis erros de campo impedem prometer cobertura/precisão absoluta.

Não há interpolação de números de casas nem uso do centro da rua/CEP como imóvel. Caso CNEFE e Nominatim sejam insuficientes, o checkout continua identificando a impossibilidade de confirmar a região. Essa lacuna é explícita; não altera preço ou libera área bloqueada silenciosamente.

## Importação em Docker

Manifesto publicado: `prisma/data/cnefe/2504009.manifest.json`, município de Campina Grande/PB, Censo 2022, publicação CSV de 20/05/2024. Contém URL oficial, hashes do ZIP/CSV e quantidade esperada. O CSV completo fica fora da imagem e do repositório.

No workspace raiz, depois de seguir `AGENTS.md` para disponibilidade do Docker:

```powershell
$taskRoot = (Get-Location).Path
$referenceDir = Join-Path $taskRoot '.local-reference-data/cnefe'
New-Item -ItemType Directory -Path $referenceDir -Force | Out-Null

docker run --rm --mount "type=bind,source=$taskRoot/backend-api,target=/repo,readonly" --mount "type=bind,source=$referenceDir,target=/output" python:3.13-alpine python /repo/scripts/download-cnefe.py --manifest /repo/prisma/data/cnefe/2504009.manifest.json --output /output

# Após backup e validação/restauração em banco isolado:
docker compose --env-file infra/.env -f infra/compose.yaml -f infra/compose.workspace.yaml run --rm --no-deps migrate

$csvPath = Join-Path $referenceDir '2504009.csv'
docker compose --env-file infra/.env -f infra/compose.yaml -f infra/compose.workspace.yaml run --rm --no-deps -v "${csvPath}:/import/cnefe.csv:ro" migrate node scripts/import-cnefe.mjs --csv /import/cnefe.csv --manifest prisma/data/cnefe/2504009.manifest.json
```

O download verifica SHA-256 do ZIP e CSV. O importador verifica o CSV antes de acessar o banco e novamente durante a leitura. Valida cabeçalhos, município, campos e quantidade. Usa parser CSV com suporte a aspas e leitura em fluxo.

A publicação oficial repete alguns códigos de endereço. A identidade de cada linha é o código original seguido da posição lógica no CSV. O checksum torna essa posição estável dentro da versão. Os registros são preservados, e o repositório agrupa as coordenadas na consulta.

Uma trava administrativa serializa importações. O dataset novo fica inativo até concluir toda a carga e suas verificações. A ativação acontece na mesma transação. Qualquer erro reverte a carga; as versões anteriores permanecem. Repetir o mesmo manifesto reutiliza o dataset, sem duplicar linhas. Para reativar uma versão anterior já importada, execute novamente seu manifesto/CSV verificado; não é preciso apagar dados.

Mudanças no checksum ativo invalidam a chave de localização na próxima cotação de um bairro dividido. A aplicação verifica a qualidade também ao reutilizar o ponto persistido. Edições de endereço limpam coordenadas e metadados de origem.

## Validação

Executar `verify-cnefe-integration.mjs` somente no PostgreSQL descartável restaurado, cujo host contém `dc-geocoding-postgres`. O script testa controlador real, criação de pedido, snapshot, bloqueio, fallback perto do corte, lacuna sem cobertura, privilégios da referência e rollback de importação inválida. O HTTP externo é simulado nesse teste isolado.

`verify-cnefe-runtime.mjs` faz cotações reais no contêiner servido, incluindo atualização legítima do cache de localização. Não cria pedidos, não muda regras de frete e não usa respostas externas simuladas.

## Fonte

- [CNEFE/IBGE](https://www.ibge.gov.br/estatisticas/sociais/populacao/38734-cadastro-nacional-de-enderecos-para-fins-estatisticos.html)
- [Qualidade posicional documentada pelo IBGE](https://www.ibge.gov.br/singedlab/dados-apoio-rs_populacao-residente.php)

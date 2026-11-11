# Operação fiscal por venda na Paraíba

## Escopo local

O painel solicita manualmente NF-e (55) ou NFC-e (65) no detalhe do pedido confirmado. O backend escolhe o modelo com base no cadastro do destinatário e no perfil da loja. O processamento usa PostgreSQL para registrar a nota e a tarefa na mesma transação. O processador transmite em outra etapa, consulta situações incertas pela chave original e salva o XML processado e o protocolo. O painel acompanha o estado e baixa o XML. O DANFE térmico da NFC-e pode ser impresso novamente pelo documento autorizado.

O piloto cobre operações internas na PB, com perfil fiscal explicitamente aprovado e cadastrado para o Simples Nacional, e pagamentos em dinheiro ou Pix estático configurado para a loja. Entregas são habilitadas no perfil após confirmação da operação. O modelo 55 exige destinatário e endereço fiscal. Para CNPJ, declarar o indicador de IE e se é consumidor final. O certificado montado fica vinculado a um único CNPJ por configuração do processo.

## Preparar homologação

1. Aplicar a migração `20261110180000_durable_fiscal_emission`. Documentos anteriores permanecem com ambiente indeterminado no novo campo. Pedidos com registros anteriores exigem conciliação antes de uma nova emissão nos casos apontados pelo sistema.
2. Conferir credenciamento, revogação do certificado antigo quando aplicável, certificado A1 válido e IE. Fornecer `CERTIFICATE_PATH`, senha em secret, `FISCAL_CERTIFICATE_ISSUER_CNPJ` e a impressão digital SHA-256 do A1 em `FISCAL_CERTIFICATE_FINGERPRINT`. O caminho e a senha são privados.
3. A imagem inclui o pacote público PL 010g v1.03 em `/app/resources/fiscal/xsd/PL_010g_v1.03`, padrão de `FISCAL_XSD_DIR`, com `nfe_v4.00.xsd`, `leiauteNFe_v4.00.xsd` e dependências. O backend usa `xmllint --nonet`. Para substituir o pacote, extrair a versão oficial aprovada e montar sua pasta em `FISCAL_XSD_DIR`; o complemento fiscal do Compose usa `FISCAL_XSD_HOST_DIR`. [Esquemas oficiais](https://www.nfe.fazenda.gov.br/portal/listaConteudo.aspx?tipoConteudo=BMPFMBoln3w%3D)
4. Para NFC-e, preencher as URLs oficiais de QR Code e de consulta por chave para cada ambiente habilitado. A emissão normal utiliza QR Code versão 3 no XML. Conferir as URLs e a consulta em homologação. [Manual de DANFE NFC-e e QR Code](https://hom.nfe.fazenda.gov.br/portal/exibirArquivo.aspx?conteudo=i0rK6ogxnx8%3D) · [SEFAZ-PB](https://portal.sefaz.pb.gov.br/info/notas-fiscais/nfc-e)
5. Registrar o perfil fiscal do emitente e as classificações por produto/modelo no cadastro técnico. Escolher série e número inicial a partir da conciliação com o emissor vigente, separando homologação de produção. A migração preserva os contadores antigos como referência. Não habilitar produção enquanto o cenário não estiver autorizado em homologação e a numeração de produção não estiver conciliada.

## Cadastros técnicos

Os campos são persistidos no banco. Em **Configurações → Configurações do sistema → Informações avançadas**, escolher a loja para editar IE, CRT e os padrões de ICMS/PIS/COFINS. O seletor desse modal não muda a loja selecionada no restante do painel. Em **Editar Área Fiscal** na edição da categoria/produto, configurar NCM, operação, unidade, origem e GTIN. Campos vazios no produto herdam da categoria. A seção **Tributação específica (opcional)** permite exceções aos padrões tributários da loja. Os valores devem ser confirmados pelo responsável fiscal.

O emitente é a loja vinculada ao pedido (`Order.storeId`), independentemente da loja selecionada no painel ao consultar o pedido. CNPJ, razão social e endereço vêm de `Store`; IE e CRT vêm do seu `fiscalProfile`. Não há preenchimento automático de IE ou regime. O piloto aceita apenas CRT 1 e bloqueia cadastro incompleto ou regime não suportado. O XML persistido de uma emissão já iniciada conserva os dados usados naquela emissão. Lojas com outro CNPJ precisam de credencial compatível; o certificado atual permanece limitado ao CNPJ provisionado no processo.

- `stores.fiscal_profile` tem `ie`, `crt: "1"` e `cityCode` quando o código não puder ser resolvido pelo cadastro atual. Cada grupo `homologation` e `production` aceita `enabled`, `enable55`, `enable65`, `serie55`, `serie65`, `lastNumber55`, `lastNumber65`, `allowDelivery`, `staticPix` e, se aplicável, `retailModel: "55"`. Os últimos números representam a posição conciliada, como números inteiros.
- `stores.fiscal_profile.taxDefaults` tem `csosn`, `pisCst` e `cofinsCst`, editados somente para a loja escolhida no modal. O piloto suporta CSOSN 102 ou 500 e PIS/COFINS 99; CFOP 5405 exige CSOSN 500. Não existe preenchimento automático desses valores.
- `Category.fiscal_data` e `Product.fiscal_data` aceitam `unit`, `origin`, `gtin` e exceções opcionais `csosn`, `pisCst`, `cofinsCst`. Null/vazio restaura a herança. Cada tributo segue produto → categoria → loja. Unidade/origem/GTIN seguem produto → categoria. A atualização do modal preserva outras chaves do JSON.
- Os cadastros antigos por modelo (`"55"`/`"65"`, com `taxProfile` `"SN102_PIS99_COFINS99"` ou `"SN500_PIS99_COFINS99"`) continuam aceitos. Os campos comuns editados no modal prevalecem sobre a configuração antiga do mesmo cadastro. Usar `"SEM GTIN"` somente para item sem GTIN. NCM/CFOP selecionados no produto prevalecem sobre os da categoria. Dados tributários ausentes ou incompatíveis bloqueiam a emissão.
- `Order.fiscal_recipient` pode informar `id`, `name`, `cityCode` e um `address` fiscal para retirada com NF-e. Para CNPJ, informar `finalConsumer` como booleano e `taxIndicator` como `"1"`, `"2"` ou `"9"`, com `ie` no caso de contribuinte. Quando a identificação for exigida e o pedido não informar destinatário fiscal, o fluxo consulta o CPF cadastrado do cliente.

## Acompanhar a emissão

Abra **Documentos fiscais** no detalhe do pedido. **Solicitar nota de teste** usa exclusivamente homologação. A solicitação de produção aparece quando `FISCAL_PRODUCTION_ENABLED=true`. Mantenha o valor inicial `false` durante o piloto de homologação. A fila processa emissões pendentes e consultas de chaves já transmitidas. Desativar a produção impede novos envios e mantém a reconciliação dos documentos já iniciados.

O painel exibe chave, ambiente, situação e protocolo quando disponível. Para resposta perdida ou incerta, o processador consulta recibo/chave com intervalos e interrompe a consulta automática após 24 horas. O comando **Consultar autorização novamente** mantém a chave e executa somente uma consulta. Rejeição requer revisão e a solicitação repetida retorna o mesmo documento. O XML e o DANFE térmico são disponibilizados após autorização. A impressão não chama o serviço de emissão.

## Antes de ampliar o piloto

O primeiro teste real de NFC-e foi autorizado em 11/11/2026, pedido local #44, série 6, número 1, ambiente 2, protocolo 325260000051907, retorno 100. O XML processado e seu hash foram persistidos. Downloads de XML/DANFE e idempotência foram conferidos. Produção continua desabilitada. A confiança TLS pública da ICP-Brasil e o endereço da consulta SVRS foram corrigidos durante o teste; as fontes estão em `resources/fiscal/README.md`.

Concluir homologação real na SVRS, conciliar registros legados, provisionar os cadastros fiscais e confirmar emissão por modalidade com o responsável fiscal. O gatilho automático, eventos fiscais de cancelamento/inutilização, contingência offline, NFS-e, cartões e Pix dinâmico, adicionais de pagamento, CNPJ alfanumérico e outros regimes tributários dependem de fluxos adicionais. A emissão fiscal deve continuar no procedimento vigente para as operações que estiverem fora do recorte homologado.

# Confiança TLS dos serviços da SVRS

`icp-brasil-v10.pem` contém apenas o certificado público da AC Raiz Brasileira v10 (SSL), obtido por HTTPS em 11/11/2026:

- Fonte: https://acraiz.icpbrasil.gov.br/ICP-Brasilv10.crt
- Referência: https://www.gov.br/iti/pt-br/assuntos/repositorio/repositorio-ac-raiz
- SHA-256 do certificado DER: `6E0BFF069A26994C15DE2C4888CC54AF84882E5495B7FBF66BE9CCFFEC7489F6`
- Validade: até 01/07/2032, 12:00:59 UTC.

O servidor de homologação NFC-e da SVRS apresenta certificado emitido pela AC SERPRO SSLv1, encadeado a essa raiz. O cliente SOAP adiciona esta AC às raízes padrão do Node apenas nas requisições à SVRS. A verificação de hostname e cadeia TLS continua obrigatória. Nenhuma chave privada ou certificado A1 pertence a este diretório.

## Esquemas públicos do XML

`xsd/PL_010g_v1.03` contém o esquema `nfe_v4.00.xsd` e suas quatro dependências do pacote oficial PL 010g v1.03, obtido no [Portal Nacional da NF-e](https://www.nfe.fazenda.gov.br/portal/listaConteudo.aspx?tipoConteudo=BMPFMBoln3w%3D) durante a preparação de homologação de 11/11/2026. São os mesmos arquivos utilizados no teste local autorizado da série 6, número 1.

A imagem inclui esses arquivos públicos e define `FISCAL_XSD_DIR=/app/resources/fiscal/xsd/PL_010g_v1.03`. Um caminho explícito pode substituir esse padrão no ambiente. A validação usa `xmllint --nonet`, sem buscar dependências pela rede. Certificado A1 e senha continuam provisionados separadamente como segredos em tempo de execução.

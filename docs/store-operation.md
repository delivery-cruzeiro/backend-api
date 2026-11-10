# Funcionamento da loja e pedidos

## Contrato

- `GET /api/stores/:id/operation`: público, exige UUID de uma loja ativa. Retorna `{ settings, isOpen, serverTime }`; loja inexistente retorna 404.
- `PUT /api/stores/:id/operation`: requer gerente (nível 3+) e recebe o objeto completo `StoreOperationSettings`. Valida horários `HH:mm`, sete dias (segunda a domingo), dias fechados e atrasos 0/2/5/10 segundos. Retorna a mesma representação do GET. Não altera outras lojas.
- `POST /api/client/orders` e `POST /api/client/checkout/pix`: passam a aceitar `scheduledAt` opcional, uma data ISO 8601 com fuso. O servidor recusa agendamentos passados, fora do atendimento ou quando o agendamento está desativado. Loja fechada exige agendamento habilitado e uma data válida.

O esquema executável é `storeOperationSettingsSchema`, exportado por `@delivery-cruzeiro/types` 1.4.7. A tabela `store_operation_settings` possui uma linha por loja, com chave estrangeira e exclusão em cascata. Lojas sem configuração usam as funcionalidades desativadas. As configurações só são persistidas ao salvar o formulário.

## Regras

Horários usam `America/Sao_Paulo`. Abertura é inclusiva e fechamento exclusivo; fechamento anterior à abertura termina no dia seguinte. Horários iguais representam 24 horas. A cauda de um período noturno pertence ao dia anterior, mesmo quando o dia seguinte está marcado como fechado. Controle manual substitui o relógio para abrir/fechar agora; os agendamentos continuam limitados aos horários configurados.

O carrinho consulta a disponibilidade ao carregar, ao recuperar foco, a cada 15 segundos e antes de enviar. O aviso aparece na home e no carrinho. O modal permite escolher a data e oferece os minutos futuros de atendimento daquela data. A API repete a validação, inclusive no fluxo PIX.

Pedidos agendados persistem `Order.scheduled_at` e uma observação legível para atendimento e impressão. O agendamento representa o horário de atendimento escolhido; não altera automaticamente o pedido para “em preparo”.

A confirmação automática persiste `Order.auto_accept_at` no recebimento do pedido. Um serviço do servidor busca prazos vencidos, inclusive após reinício, e confirma apenas pedidos ainda pendentes, usando atualização condicional dentro de transação. Cancelamento ou confirmação anterior não é sobrescrito. O evento de criação continua emitido independentemente da confirmação, preservando aviso e som mesmo no modo imediato. O painel ignora versões anteriores recebidas fora de ordem. A confirmação publica o evento normal de atualização para painel, impressão e automações existentes. A varredura de recuperação tem resolução de 250 ms; o processamento depende da disponibilidade do servidor/banco.

O admin mantém a conexão compartilhada com `attendants` durante toda sua navegação, filtra a loja selecionada e usa um único áudio. Fora do painel, mostra cartões reutilizáveis de 12 rem × 6,5 rem com borda esquerda primary de 4 px. Abrir/mover o pedido ou dispensar o cartão reconhece o aviso. Se o navegador bloquear reprodução, uma interação permite tentar novamente. Confirmação automática não silencia a notificação de criação.

## Migração

`20261107010000_store_operation_settings` cria a tabela e adiciona `scheduled_at` e `auto_accept_at` ao pedido. É uma migração aditiva. Aplicar antes de iniciar esta versão da API. Backend, admin e delivery precisam usar o pacote de tipos 1.4.7 incluído em seus diretórios `vendor`.

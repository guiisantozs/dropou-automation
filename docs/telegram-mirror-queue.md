# Ofertas espelhadas — fila persistente, etapa 4

**Atualização de 16/11/2026:** a tentativa autorizada foi interrompida no preflight por privilégios padrão excessivos de `service_role`. Nenhuma migração executada; worker encerrado. Consulte o [relatório do impedimento](telegram-mirror-migration-review.md). A proposta com o hash abaixo precisa de correção e nova validação antes de ser aplicada.

**Implementação local preparada; migração ainda NÃO aplicada.** Projeto conferido por leitura: `wqpdyfipjsnyzxktacqh`. A versão anterior do worker continua carregada. Não reiniciar o worker com este código antes da aplicação autorizada: o preflight de inicialização recusa iniciar sem a nova tabela, antes de restaurar contas Telegram.

Migração incremental gerada pela CLI oficial: [`20261116025405_mtproto_persistent_mirror_queue.sql`](../supabase/migrations/20261116025405_mtproto_persistent_mirror_queue.sql). A migração MTProto anterior já aplicada permanece intacta. Não executar `db push` geral, reaplicar migrações antigas ou usar os roteiros de aplicação da etapa 1.

SHA-256 da proposta validada: `8707d45cc9fddd928d9e75ac4d69ee6f4e74b3b0d562706a03a34884ed3dfc98`.

## Fluxo preparado

1. Uma mensagem nova de texto ou foto com legenda entra na janela de teste da fonte selecionada e explicitamente controlada pelo administrador. Somente Dropou admite novas ofertas nesta etapa.
2. O worker aguarda a gravação em `mirror_offers` antes de encerrar o tratamento do evento. Grava até cinco URLs Shopee sanitizadas, IDs/horários da mensagem, conexão, fonte e destino sugerido; não grava texto, legenda, remetente, mídia, telefone ou sessão na fila.
3. A cada ciclo, lê as pendências do banco, resolve links pelos métodos já permitidos, verifica o catálogo e registra a identidade canônica loja/produto. Uma oferta ativa por produto e canal; duplicatas preservam sua origem e vínculo com o registro anterior, sem repetir a API.
4. Uma claim transacional exclusiva reserva a oferta. O mesmo conversor da etapa 3 usa cache e `productOfferV2` oficial para obter nosso `offerLink` e os dados comerciais. A finalidade contábil passa de `manual` para `mirror`.
5. O sucesso registra Afiliação concluída e Pendente de revisão em uma transação, incluindo dois eventos no histórico. Falhas têm motivo e tentativa; nunca são declaradas sucesso. Não há criação de produto definitivo, legenda, job de publicação ou envio Telegram.
6. A nova área `/?brand=dropou&view=mirrored-offers` consulta o Supabase pelo backend autenticado, independentemente do processo do worker. Encerrar/limpar o diagnóstico não apaga ofertas persistentes. A entrada da fila temporária no painel de conexões aponta para a nova área quando o worker novo estiver ativo.

Nesta etapa, **a admissão de novas mensagens ainda exige a janela controlada de dez minutos**. Não foi ativada escuta contínua de canais. As ofertas já admitidas continuam sendo processadas depois do encerramento da janela. Um reinício retoma Recebidas/Identificadas; não recupera conversas ou mensagens de períodos offline. Não há importação retroativa da fila temporária anterior.

## Estrutura e permissões

| Estrutura | Conteúdo / acesso |
| --- | --- |
| `mirror_offers` | Origem e destino imutáveis, IDs canônicos, dados API/cache, link próprio, estado, tentativas, versão e lease. Leitura autenticada por proprietário/marca; escrita somente servidor. |
| `mirror_offer_events` | Transições, horário, tentativa, motivo seguro e operador da revisão. Sem atualização/exclusão concedida ao servidor. |
| `mirror_channel_policies` | Intervalo de repetição por canal e cota diária de espelhamento. Operadores leem; somente administradores alteram via backend. |
| `mirror_budget_limits` | Tetos internos globais. Sem acesso de navegador; servidor somente lê. |

RLS ativo nas quatro tabelas. As três políticas de leitura usam `private.dropou_workspace_owner()` e `dropou_brand_scope()`, respeitando os membros e as marcas existentes. `anon` não recebe privilégios. As rotas usam `sessionDb`; escritas exigem também `publicationAdmin` e a RPC verifica o operador real, seu acesso à marca e a versão da oferta. Nenhuma RPC nova é executável por `anon` ou `authenticated`; todas usam `security invoker` e `search_path=''`.

Funções novas: `dropou_mirror_ingest`, `identify`, `claim`, `finish`, `fail_received`, `review`, `policy`, além dos triggers `guard` e `audit` (todos com prefixo `dropou_mirror_`). A ingestão exige lease do worker, conexão ativa, fonte controlada e janela válida. As conclusões exigem o token da oferta e a lease vigente. Identidade/versão, constraints com tratamento explícito de NULL, índices únicos e locks impedem conclusões antigas e ofertas ativas duplicadas.

Estados: Recebida → Identificada → Processando → Afiliação concluída → Pendente de revisão → Pronta para publicação. Falhas podem ser reenviadas explicitamente; descarte preserva registro/histórico. A interface confirma revisão, nova tentativa e descarte. `Publicada` existe no modelo, mas **não há transição executável para esse estado**: uma etapa futura deverá ligá-la aos recibos do publicador existente.

Uma lease de processamento vencida vira Falhou, exigindo ação explícita. O sistema não repete automaticamente uma chamada cujo resultado ficou incerto. A chave de reserva e o cache existentes continuam reduzindo repetição após reinícios. A política padrão é 24 horas entre publicações do mesmo produto por canal; zero permite reutilização após publicação, mas nunca duas ofertas ativas simultâneas no mesmo canal. Registros de destinos diferentes permanecem separados. Mudanças na configuração do destino não reescrevem ofertas antigas.

## Consumo Shopee

| Uso | Reserva / teto interno padrão |
| --- | --- |
| Importação manual | `manual`; até 200/dia global, sujeito ao limite do canal e ambiente existentes. |
| Espelhamento | `mirror`; até 10/dia global e 10/canal, configurável para baixo. A cota do canal aceita zero para impedir novas consultas. |
| Curadoria | `search` e `revalidate`; compartilham o teto anterior de 40/dia de trabalho em segundo plano com o espelhamento. Limites menores existentes continuam valendo. |

O espelhamento não utiliza a reserva manual. As duas RPCs de reserva existentes são atualizadas para reconhecer `mirror`, compartilhar o lock de orçamento, preservar backoff e priorizar importações manuais em processamento. `shopee_requests.kind` passa a aceitar `mirror`; registros anteriores não são modificados. A RPC legada mantém seus limites totais mais restritivos.

O novo `SHOPEE_MIRROR_DAILY_REQUEST_LIMIT` é opcional, padrão 10; não foi adicionado nem alterado no `.env.local`. A configuração do ambiente só pode reduzir o teto efetivo em relação ao banco. O painel altera a cota por canal, sem elevar tetos globais. Cache válido de 15 minutos não consome API; zero na cota impede consultas novas, sem impedir reutilizar cache.

Esses números são **limites internos**, não uma afirmação sobre a quota contratual da Shopee. Continuam valendo autorização da conta, limites do provedor, respostas de erro e cooldown. Nome/imagem/preço são da API ou de seu cache; dados ausentes não são inventados. Faixa de preço não identifica uma variante específica. O parser pode rejeitar anúncios sem dados comerciais suficientes.

## Revisão da migração e riscos restantes

- Nova estrutura e dados de configuração são incrementais. Não há DROP CASCADE, exclusão/atualização de dados anteriores, alteração do bot, cron, credenciais ou ativação de rotinas.
- O ponto compartilhado de impacto é o orçamento: substituição de **duas funções existentes** e ampliação da constraint `shopee_requests_kind_check`. A criação de índices é somente em tabelas novas; o ALTER da constraint exige lock breve sobre `shopee_requests`. Aplicar em janela sem consultas/worker, com timeout e transação única.
- O preflight remoto confirmou ausência de tabelas/funções com os nomes novos e ausência desta versão no histórico. Repetir a conferência imediatamente antes da aplicação, pois o usuário pode continuar operando.
- Antes da aplicação autorizada: parar o worker, conferir o projeto e hash do SQL, executar [`telegram-mirror-preflight.sql`](telegram-mirror-preflight.sql) somente por leitura e comparar as definições das funções de orçamento com as revisadas. Interromper em qualquer divergência.
- Aplicar exclusivamente esta migração em transação e registrar a versão no histórico. Não executar agora. Em perda de conexão após commit, consultar o histórico antes de qualquer nova tentativa; não repetir automaticamente.
- Após autorização/aplicação, executar [`telegram-mirror-postcheck.sql`](telegram-mirror-postcheck.sql). Esperado: quatro tabelas com RLS, três políticas de leitura, nenhuma escrita de navegador, nenhuma RPC privilegiada pública, índices únicos e histórico da versão. Comparar os dados anteriores e verificar Data API antes de iniciar o worker novo.
- O histórico persistente não possui TTL nesta etapa. Crescimento e eventual política de arquivamento devem ser definidos antes de operação em grande volume. A tela mostra até 250 eventos por oferta; o banco mantém todos.
- PGlite valida a lógica de claims, idempotência e fencing, mas serializa comandos na mesma instância. Isso não substitui um teste de contenção com conexões PostgreSQL independentes, a executar em ambiente autorizado antes de operação contínua.
- “Pronta” é revisão preparatória. A marcação exige consulta de até 15 minutos e destino verificado; o futuro publicador deverá revalidar preço, variante, direitos de imagem e destino no momento do envio, inclusive ofertas que envelheceram depois da revisão.

## Validação desta etapa

- **Local:** 394/394 testes completos, typecheck e build de produção aprovados. SQL aplicado em PGlite sobre a cadeia de migrações; RLS/operadores, NULL, transições, identidade, replays, claims, tokens vencidos, retry explícito, política de repetição, destinos e reservas protegidas validados.
- Reinício: exportação/reabertura do banco PGlite conserva ofertas e histórico. Uma instância nova de `PersistentMirrorOffers` processa o recebimento persistido por outra instância; outra reinicialização não repete a conversão concluída. Conversor/provedor simulados nesses testes.
- Chrome com sessão/APIs fictícias: 20 combinações de cinco estados e larguras 320/375/768/1440, sem overflow ou erro de página. Cópia, revisão com confirmação/cancelamento, retry, histórico, política administrativa, operador e migração pendente conferidos. Capturas mobile/desktop inspecionadas. Nenhuma escrita remota por esses testes.
- **Remoto, somente leitura:** projeto correto, migração anterior presente, nova ausente, nenhum conflito de nomes e nenhuma janela de diagnóstico ativa. A lease da versão anterior do worker segue ativa. No momento da conferência, nenhuma requisição Shopee registrada no novo dia contábil Bahia.
- **API real nesta etapa:** zero chamadas Shopee, zero mensagens publicadas, zero novas autenticações e zero migrações remotas. O sucesso real da etapa 3 continua documentado separadamente; não é apresentado como validação da nova persistência em produção.

## Próxima validação, somente após autorização

Depois da migração e dos postchecks: iniciar `npm.cmd run worker:telegram` e manter o terminal aberto. Abrir `http://127.0.0.1:3000/?brand=dropou&view=telegram-connections`, iniciar uma janela na fonte controlada e enviar manualmente texto/foto próprios com o mesmo produto. Conferir a nova área Ofertas espelhadas, consumo `mirror`, duplicata e histórico. Encerrar o diagnóstico e reiniciar o worker com Ctrl+C seguido do mesmo comando; conferir que o registro/link/histórico permanecem sem nova conversão desnecessária. Não publicar como consequência do teste.

Para publicação automática ainda faltam autorização específica, admissão contínua de fontes, hospedagem persistente e integração dos registros revisados com o publicador/recibos e agendador existentes. Nenhum desses mecanismos foi ativado nesta etapa.

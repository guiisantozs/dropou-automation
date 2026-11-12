# Shopee Affiliate API · Dropou Tech & Games

Implementação iniciada em 11/11/2026. Base inicial: `main`, sincronizada com `origin/main` em `2a95200`. Três migrações incrementais instaladas no Supabase existente. A busca `keyword:"gamer"` com `listType:2,sortType:2` foi validada em 12/11. Código local, sem push/deploy; automação pausada. Uma postagem manual anterior foi explicitamente autorizada. Guia atual de qualidade, pontuação e histórico: [Garimpo gamer](shopee-gamer-quality.md).

## Funcionalidades

- Backend `productOfferV2` no endpoint brasileiro `https://open-api.affiliate.shopee.com.br/graphql`. O JSON é serializado uma única vez; a mesma string é assinada e enviada. Assinatura SHA256: `App ID + timestamp Unix em segundos + corpo JSON + Secret`. O `offerLink` retornado é preservado, sem outra chamada para gerar link.
- Nome, IDs da loja/produto, foto, link, preços mínimo/máximo, estrelas, vendas, comissão e desconto informado são normalizados. Campos opcionais ausentes permanecem ausentes. IDs numéricos imprecisos, URLs não permitidas, identidades trocadas e preços inválidos são descartados.
- Palavras-chave rotativas para gamer e tecnologia. Referências: mil vendas, nota 4,6, desconto de 15% quando informado e score 55, ajustáveis. Score: vendas 40, avaliação 25, preço/desconto 20, comissão 15; dados ausentes reduzem confiança. Relevância é filtro obrigatório. Normalização e limites em [Garimpo gamer](shopee-gamer-quality.md).
- Rodada diária de desempenho gamer, palavras e categorias cadastradas, conforme orçamento/horários. Padrão: quatro buscas de até 50 resultados, reservando quatro consultas para revalidação. Cache, decisões do curador e observações históricas persistem. Nenhuma fonte de busca é repetida no mesmo dia.
- Orçamento inicial de oito requisições por grupo, com teto global de dez no servidor. Ambos incluem busca manual, automação, revalidação, falhas e reservas sem resposta. Uma transação com bloqueio global impede ultrapassar o teto em execuções concorrentes. Aumentar o limite do grupo no painel não supera o teto global.
- Rate limit aplica `Retry-After` e backoff persistente, sem laços de retry. Revalidação admite uma tentativa adicional/dia; buscas são tentadas uma vez por formato/dia. Falhas permanecem visíveis e cobradas no orçamento.
- **Automação de Ofertas**, em `/?brand=dropou&view=automation`: configuração, consumo, candidatos/pontuação, aprovação, rejeição, remoção, planejamento, simulações, fila, publicações e erros. Abrir o painel não consulta a Shopee.
- Horários iniciais **09:00, 12:30, 16:30 e 20:30**, fuso **America/Bahia**; busca diária às 08:00. Sem oferta confiável, o horário fica vazio. Horários com mais de dez minutos de atraso são pulados.
- Telegram reutiliza remetente, `telegram_jobs`, `deliveries` e `channel_events`. Cada oferta cabe em um `sendPhoto`, com foto acima e legenda abaixo. A seleção automática agora bloqueia faixas de variantes não verificadas; o template anterior “A partir de” permanece no histórico/teste manual. A presença na API não prova estoque.
- Bloqueio por loja/produto no mesmo canal durante trinta dias, usando histórico persistente. Liberação manual autoriza uma repetição por dez minutos e conserva o recibo anterior na estrutura existente de intenções de republicação. Resultados incertos/parciais nunca são repetidos automaticamente.
- WhatsApp permanece manual e independente. Envios Telegram não confirmam WhatsApp. Não há chamada de IA paga no motor.
- A arquitetura por proprietário/operação e os destinos de `operation_settings` são preservados. Ferramentas e roupas não executam o novo motor.

## Banco e segurança

Migrações geradas pela CLI oficial, instaladas no projeto existente: `supabase/migrations/20261111190838_shopee_offer_automation.sql` (remoto `20261111201300`) e `20261111201601_shopee_request_completion_clock.sql` (remoto `20261111202006`). Os nomes e o conteúdo foram conferidos; os timestamps remotos diferem dos arquivos locais. **Não reaplicar o schema inicial nem reinstalar estas migrações no mesmo banco.**

A segunda migração usa o relógio do banco para finalizar requisições e calcular o backoff, com conclusão idempotente. Isso evita que a diferença observada de cerca de 2min40 entre computador e servidor libere consultas antes do prazo. O erro GraphQL `10000: System Error` é transitório (`provider`), sem simular resultados vazios nem causar uma suspensão de um dia por contrato.

A terceira migração, `20261112112950_shopee_gamer_quality_history.sql`, também já foi aplicada (remoto `20261112114322`): acrescenta avaliação detalhada e observações históricas protegidas por RLS, sem mudar o estado dos canais/agendador. Em outra instalação, aplicar as três incrementais após as bases necessárias. Não reaplicar no projeto atual.

Reutiliza `operation_settings` (novo JSON `shopee_config`), produtos/ofertas, fila, recibos, histórico, intenções de republicação, logs e reservas de execução. Acrescenta somente `shopee_offers`, `shopee_runs`, `shopee_requests` e os vínculos/evidências/leases necessários na fila existente.

Novas tabelas têm RLS e leitura por proprietário/marca. Escritas e funções são exclusivas do backend `service_role`; as APIs exigem sessão verificada, marca Dropou e autorização em `telegram_dispatch_config.owner_ids`. Não há `SECURITY DEFINER` novo. Credenciais ficam exclusivamente no servidor.

O modo `official` nos recibos indica observação da API, sem alegar estoque. Os modos manuais `safe`/`verified` mantêm suas validações. A simulação **não cria produtos, ofertas, jobs ou recibos**: persiste somente cache, requisições, rodada e planejamento. Leases/tokens impedem revalidações concorrentes; recibos incertos exigem conferência do canal.

## Variáveis na Vercel

Manter as configurações públicas de Supabase já usadas pela aplicação. As variáveis abaixo são exclusivas do servidor:

| Variável | Valor/finalidade |
| --- | --- |
| `SHOPEE_AFFILIATE_APP_ID` | App ID aprovado na API brasileira |
| `SHOPEE_AFFILIATE_SECRET` | Secret da mesma aplicação |
| `SHOPEE_AFFILIATE_APPROVED` | `true` apenas com acesso autorizado pela Shopee |
| `SHOPEE_DAILY_REQUEST_LIMIT` | `10` inicialmente; teto global de 1 a 1000 |
| `SHOPEE_AUTOMATION_LIVE` | **`false` durante a validação** |
| `SUPABASE_SECRET_KEY` | Chave privilegiada já usada pelo backend; alternativa legada: `SUPABASE_SERVICE_ROLE_KEY` |
| `TELEGRAM_BOT_TOKEN` | Bot existente com permissão de postar |
| `TELEGRAM_CHAT_ID` / `TELEGRAM_CHANNEL_ID` | Fallback existente; se ambos existirem devem coincidir. Prefira salvar/verificar o destino em Configurações |
| `TELEGRAM_TEST_CHAT_ID` | ID numérico de canal separado dos destinos de produção |
| `SHOPEE_TELEGRAM_TEST_ENABLED` | `true` somente para disponibilizar o botão explícito de envio de teste |

Não usar `NEXT_PUBLIC_` nas credenciais. O operador deve constar na lista administrativa do dispatcher. Seu segredo continua armazenado no banco; não foi criado endpoint de cron sem autenticação.

## Testar sem liberar a produção

1. Conferir o projeto/banco existentes. Neste projeto, as três migrações incrementais já estão aplicadas. Em outra instalação, aplicar as três após as migrações anteriores necessárias, sem reaplicar o schema geral.
2. Configurar as credenciais na Vercel, manter `SHOPEE_AUTOMATION_LIVE=false` e publicar o código. Não é necessário ligar o dispatcher para a busca manual.
3. Entrar em **Dropou → Automação de Ofertas**. Manter **Modo de teste** e **Exigir aprovação** marcados; salvar.
4. Clicar em **Buscar ofertas agora**. Conferir aceitação da assinatura, campos disponíveis no contrato da conta, fotos, links de afiliado, relevância e orçamento. Repetir no mesmo dia deve reutilizar o cache.
5. Aprovar candidatos e usar **Planejar horários com o cache**. A simulação é registrada na rodada; não cria publicações nem recupera horários passados.
6. Para um envio real **de teste**, configurar o canal separado e `SHOPEE_TELEGRAM_TEST_ENABLED=true`. Clicar em **Preparar teste Telegram**, conferir nome/ID e confirmar **Enviar somente no canal de teste**. O envio real fica somente naquele canal e em logs, sem contar como publicação do grupo. Não repetir resultados incertos. Desabilitar a variável de teste ao terminar.
7. Conferir persistência, foto acima da legenda, preço/omissão, limite de requisições e ausência de confirmações WhatsApp. Um erro GraphQL exige conferir a documentação autorizada da conta; não substituir por scraping ou dados inventados.

### Liberação após validação

São necessárias: `SHOPEE_AUTOMATION_LIVE=true`; rotina Shopee ligada e modo de teste desligado no painel; e operação habilitada em **Agendamento**, que controla o dispatcher global existente. O canal deve estar salvo/verificado. Aprovação individual permanece exigida enquanto seu controle estiver marcado.

É reutilizado o único cron existente, `dropou-telegram-dispatch`, a cada minuto em pg_cron. `vercel.json` não recebeu cron. Isso evita criar agendamento incompatível com o plano Vercel. A fila anterior tem prioridade; uma invocação ociosa executa uma publicação Shopee ou uma rodada de busca, dentro do limite da função.

Desligar a rotina ou colocá-la em simulação cancela jobs Shopee que ainda aguardam envio, preservando recibos/histórico. Uma chamada já iniciada ao Telegram exige a conferência normal do recibo.

## Evidência dos preços

`priceDiscountRate` é apresentado como informação da API e nunca convertido em preço anterior. Uma queda só entra na legenda se houver observação anterior do mesmo produto, sem faixa de variantes, nos últimos trinta dias; o texto informa “abaixo do preço observado em [data]”. Não há “de” artificial.

Preço com mais de quinze minutos exige revalidação no mesmo orçamento. Se a API deixar de retornar a oferta, o horário é pulado. Sem orçamento/conexão, a política inicial pula; a alternativa configurável omite preço e desconto. Nenhum estoque é inventado.

## Validação histórica inicial e pendências

Os registros abaixo precedem o refinamento gamer. Estado atual: busca gamer com lista/ordenação 2 confirmada, oito consultas do grupo hoje, 114 produtos avaliados e sete candidatos. Migração de histórico aplicada; detalhes e validação atual em [Garimpo gamer](shopee-gamer-quality.md). Categorias com os novos parâmetros e todos os termos individuais ainda não foram verificados ao vivo.

- 26 verificações Shopee locais, incluindo classificação do erro real e conclusão idempotente pelo relógio do banco. HTTP/Telegram simulados; SQL executado em PGlite. Suíte completa de 12/11: **192/192 aprovados**, tipos e build aprovados. Conferência final de alterações registrada em `VALIDACAO.md`.
- Consultas remotas de 12/11 confirmaram as duas migrações, cache persistido e dispatcher/três operações pausados. Credenciais Shopee, Supabase e Telegram estão presentes em `.env.local`; valores privados removidos de `.env.example` e nunca incluídos nestes relatórios.
- Shopee autenticou consultas gerais (20 produtos em 11/11), introspecção do contrato e consultas por loja/produto. Palavras-chave, inclusive `ps5`, e filtro por categoria retornaram HTTP 200 com erro GraphQL `10000: System Error`. Os parâmetros existem no contrato retornado pela própria API. Isso isola a falha na consulta filtrada; não comprova a causa interna ou disponibilidade futura.
- Em 12/11 foram consumidas cinco requisições de diagnóstico (três respostas válidas e duas falhas). Em 11/11 foram seis (três válidas e três falhas). Todas permanecem no orçamento, inclusive introspecção e erros; nenhum limite foi aumentado ou tentativa removida.
- Cache: 22 produtos, somente um elegível. Teclado mecânico RGB ABNT2: faixa R$ 99,99–119,99, avaliação 4,9, 25 vendas, pontuação 67, decisão `found` (aguarda revisão). Mouse Redragon M808: avaliação 4,9, mas zero vendas retornadas pela API; bloqueado pelo filtro. Os 20 produtos gerais também estão fora dos critérios. Preços são observações datadas, não garantia atual.
- Bot administrador do canal Dropou confirmado por chamadas de leitura. Nenhuma mensagem enviada. `@dropoutech` informado pelo usuário foi confirmado como o próprio canal principal; ele esclareceu não possuir outro. Não usar esse destino na rota de teste isolado. Uma postagem no canal principal requer autorização explícita e o fluxo normal de publicação com histórico, sem liberar toda a automação. `SHOPEE_AUTOMATION_LIVE` e `SHOPEE_TELEGRAM_TEST_ENABLED` continuam `false`.
- A descoberta automática por palavras-chave permanece pendente do provedor. Não liberar produção apenas porque uma consulta por ID funcionou. Diagnóstico sem credenciais para suporte em [shopee-api-diagnostic.md](shopee-api-diagnostic.md).
- Nenhum navegador estava conectado ao controle de UI. SSR/JSDOM e interações do painel foram testados; inspeção visual real desktop/celular permanece pendente. Prévia estática com fixtures: `node --import tsx scripts/review-shopee.ts --serve`; abrir `http://127.0.0.1:4186/review.html` ou `/mobile.html` (iframe de 375 px). Não acessa a conta e desativa controles operacionais.

Referências: [portal oficial Shopee](https://affiliate.shopee.com.br/open_api), [RLS Supabase](https://supabase.com/docs/guides/database/postgres/row-level-security), [Telegram sendPhoto](https://core.telegram.org/bots/api#sendphoto), [cron Vercel](https://vercel.com/docs/cron-jobs/usage-and-pricing).

## Diagnóstico local sem postagem

`node --import tsx scripts/verify-shopee.ts` lê cache, orçamento e pausas, sem consultar a Shopee. `--live` executa a rodada normal com o motor existente. Sondagens explícitas: `--minimal-probe`, `--probe-full`, `--probe-keyword-full`, `--probe-keyword-ranked`, `--probe-recommended-batch`, `--probe-gaming-category`, `--probe-schema` e `--probe-item=shopId/itemId`. Não repetir sondagens para consumir todo o limite; elas usam o mesmo teto e backoff da operação.

Na validação gamer foram usados também `--probe-performance` e `--probe-performance-keyword`; ambos consumiram uma consulta e retornaram 50 resultados. Hoje o grupo já atingiu oito chamadas. Para conferir a nova classificação sem chamar a API: `node --import tsx scripts/reassess-shopee-cache.ts`.

O script exige projeto Dropou, um administrador, dispatcher/operação/rotina desligados e simulação ativa. Não habilita rotinas, não aprova produtos, não cria ofertas/fila/recibos nem envia Telegram. Relatórios locais datados ficam em `outputs/shopee-live/`, ignorado pelo Git, sem sobrescrever sondagens anteriores. A consulta direta usa somente IDs validados; dados e links vêm da API oficial. Identificar um anúncio por sua página pública não confirma preço ou estoque: a observação utilizada vem da API.

## Primeira postagem manual autorizada

Após esclarecer que possui somente o canal principal, o usuário aprovou explicitamente a foto/legenda do teclado. Uma mensagem `sendPhoto` foi confirmada em [@dropoutech, mensagem 18](https://t.me/dropoutech/18), com marcador TESTE DROPOU, preço revalidado a partir de R$ 99,99 e link de afiliado. Job e entrega `sent`, uma tentativa, um evento de sucesso; WhatsApp permanece sem confirmação.

O comando específico `scripts/send-approved-shopee-test.ts` usa reserva durável de autorização única, revalidação orçada e o fluxo manual queue/claim/receipt. Não é uma liberação permanente, não reaproveita a rota de canal isolado e não altera flags/pausas. Sua execução já foi consumida; não reenviar. Recibo local em `outputs/shopee-live/first-telegram-test-receipt.json`. Orçamento passou a seis chamadas hoje. A validação anterior sem mensagens descreve o estágio anterior à autorização; a descoberta automática continua pendente.

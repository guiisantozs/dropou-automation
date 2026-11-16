# MTProto → link da nossa conta Shopee — etapa 3

Registro histórico da etapa 3. O código local agora prepara a [fila persistente e reserva `mirror` da etapa 4](telegram-mirror-queue.md), ainda sem aplicação remota. As descrições de fila temporária/reserva `manual` abaixo correspondem ao teste real anterior.

A fila de teste continua temporária e exclusiva de Dropou. Depois de receber uma mensagem nova da fonte controlada, identificar os IDs e consultar o catálogo, o worker pede a oferta à integração oficial já existente. Não cadastra produtos, prepara ofertas, gera legendas nem publica. Nenhuma migração, dependência ou credencial MTProto nova.

## Integração reutilizada

O importador de Meus links Shopee já obtém `offerLink` por `productOfferV2`. A consulta assinada retorna o link atribuído à conta configurada; não é preciso inventar parâmetros ou implementar outra conversão/encurtador. `src/server/shopee/product-offers.ts` reúne essa consulta e sua contabilização para o importador existente e o worker. `budget.ts` contém a reserva anterior, reexportada por `on-demand.ts` para preservar seus consumidores. Parser, assinatura, endpoint, campos GraphQL e limites da integração permanecem os mesmos.

O worker só fornece os IDs para esse serviço. O link recebido, os parâmetros de afiliado de terceiros e o texto/legenda não são enviados à API ou salvos como nosso link. A referência canônica sem rastreamento fica separada do `offerLink` retornado oficialmente. O parser exige os mesmos IDs e URLs HTTPS confiáveis; resposta vazia/incompatível, link canônico sem afiliação, falha de autenticação, quota ou provedor são falhas explícitas. Não há fallback para o link recebido.

Nome, imagem, preço mínimo/máximo e horário de consulta vêm exclusivamente da API ou de seu cache recente. A imagem é uma URL oficial mostrada no painel, sem download da mídia Telegram. O contrato atual não retorna preço anterior nem variante específica; a interface informa essa ausência. Uma faixa não determina qual variante corresponde à foto. O preço da mensagem original não é lido como dado comercial confirmado. Catálogo existente fornece somente identidade/nome local antes da conversão, sem substituir a consulta oficial.

## Cache, orçamento e segurança

- Cache reutilizado: `shopee_import_cache`, isolado por proprietário/loja/produto e acessível somente ao servidor. Mesmo TTL de 15 minutos e validação de identidade/hosts antes de reutilizar. Nenhuma alteração de schema/RLS. Os fatos podem ser compartilhados entre canais da mesma conta pelo mecanismo anterior, sem compartilhar decisões ou histórico.
- Reserva existente `dropou_shopee_reserve_v2`, finalidade `manual`, marca `dropou`; conclusão por `dropou_shopee_finish`. Respeita limite do canal, global de importações, exclusividade de requisição e backoff real. Os padrões internos atuais são 200/canal e 200 globais/dia, configuráveis pelo sistema existente; não representam o limite contratual da Shopee. Nenhum limite é aumentado por este recurso.
- Evento duplicado não gera outro item. Mensagens distintas do mesmo produto compartilham uma conversão por janela, inclusive o resultado de falha. Após sucesso, o cache evita nova API. A chave de reserva inclui conta/marca/IDs e bloco de 15 minutos para reduzir repetições após reinício ou troca de janela; erro/duplicidade não dispara retry automático. Uma nova janela em bloco posterior pode consumir nova tentativa se não houver cache válido.
- Até cinco links/mensagem, 50 itens/janela e dez resoluções de links curtos distintas. Fila em memória por até uma hora; encerrar, trocar seleção, desconectar ou reiniciar limpa os itens. Sem replay ou histórico de conversas.
- Encerrar/substituir a janela, expirar ou perder a lease impede aplicar resultados pendentes. Interrupção explícita aborta a requisição em andamento. Uma chamada já enviada pode ter sido contabilizada mesmo se o resultado for descartado. Falha ao salvar cache é informada sem repetir automaticamente.
- Credenciais Shopee somente no servidor: `SHOPEE_AFFILIATE_APP_ID`, `SHOPEE_AFFILIATE_SECRET`, `SHOPEE_AFFILIATE_APPROVED=true`. O worker precisa receber o mesmo ambiente autorizado da integração; reiniciá-lo após configurar. Não copiar segredos para logs, frontend ou Git.
- Dashboard conserva `sessionDb`, administrador e `publicationAdmin`. O HTTP privado existente continua com bearer secreto e leitura de fila sem criar conexão no banco. Autenticação Telegram, sessão cifrada, bot publicador, cron, outras plataformas e cores permanecem no fluxo anterior.

## Teste manual e execução local

1. Manter uma única instância de `npm.cmd run worker:telegram` e o Next local `npm.cmd run dev -- --port 3000`.
2. Abrir `http://127.0.0.1:3000/?brand=dropou&view=telegram-connections`. Conferir conta conectada e worker online. Iniciar uma nova janela na fonte controlada.
3. Depois do início, publicar manualmente um texto com link direto e uma foto própria/de teste com link curto do mesmo produto na legenda. Não reutilizar mensagens de janelas anteriores.
4. Conferir IDs, catálogo, nome/imagem/preço, status e link na fila. O resultado deve indicar origem API ou cache e horário. Copiar o link e abrir manualmente para conferir; uma URL de nossa API não garante disponibilidade, elegibilidade futura nem pagamento de comissão.
5. Encerrar e limpar diagnóstico após a validação. A conta fica conectada; a fila/diagnósticos são limpos, conservando somente fatos do produto e contabilização no cache/orçamento anteriores.

Ctrl+C no terminal do worker encerra os sockets e libera a lease. Se o Windows perguntar se deseja finalizar o arquivo em lotes, responder `S`. O worker local depende de esse processo e computador permanecerem ativos; hospedagem persistente fica para outra etapa. Não iniciar outra instância na mesma porta. O Dockerfile foi atualizado para incluir os módulos compartilhados; testes no Windows não equivalem a construir o container.

## Evidência de validação

Os testes com mocks cobrem cliente oficial, escopo, cache fresco/expirado, IDs divergentes, URLs inválidas, credenciais ausentes, quota/backoff, erros GraphQL, falta de dados, deduplicação texto/foto e interrupção. QA do Chrome usa sessão e APIs fictícias, incluindo copiar o link e os temas existentes. Resultados reais devem ser registrados separadamente em `VALIDACAO.md`, sem credenciais, textos de conversa, imagens Telegram ou URLs de rastreamento completas.

Em 15/11/2026, às 23:37–23:39 no fuso Bahia, o usuário enviou texto #59 e foto com legenda #60 na fonte controlada. Ambos identificaram loja `344381236`, produto `50153521656`, já existente no catálogo. Uma única reserva/chamada real `manual` terminou `ok` e retornou nome, imagem, preço R$ 3.299,00 e o link afiliado da integração; os dois itens exibiram `generated` e compartilharam o mesmo link/horário de resposta. O usuário confirmou “Link gerado” e o botão de copiar no painel. Cache gravado com o mesmo ID e horário, sem cadastro definitivo ou publicação. Conta conectada, sem erro de conexão/conversão e healthcheck 200 após os envios. Isso comprova retorno oficial de `offerLink` para a conta configurada, sem afirmar pagamento de comissão ou disponibilidade futura.

Validação local desta versão: 384/384 testes completos, typecheck e build aprovados; Chrome com fixtures em 28 combinações de estado/largura, incluindo cópia real da URL fictícia via clipboard, sem overflow/erros ou alteração dos temas. Esse QA de navegador não usa a sessão real do administrador; a confirmação visual real acima veio do usuário.

Depois de o usuário confirmar a cópia, o teste foi encerrado e limpo: janela nula, fila/diagnósticos vazios, conta conectada, lease ativa e healthcheck 200. Worker local atual PID 18244, Next PID 19932; PIDs podem mudar e devem ser conferidos antes de usá-los para encerrar processos.

Referência de persistência do cache: [Supabase JavaScript — upsert](https://supabase.com/docs/reference/javascript/upsert). O contrato Shopee utilizado é o já validado na integração do projeto; não foram adicionados campos especulativos ou rotinas de scraping.

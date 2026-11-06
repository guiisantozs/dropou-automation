# Publicação, agendamento e performance do Dropou

Entrega de 06/11/2026. Escopo: Dropou — Games & Tecnologia, Mercado Livre. A geração OpenAI, o modelo, os prompts e o orçamento foram preservados. Nenhuma chamada paga e nenhuma publicação real fazem parte desta validação.

## 1. Causas dos bloqueios

- A preparação para WhatsApp exigia preço conferido há até 15 minutos, estoque, link, revisão do print e condição Pix confirmada. Os bloqueios eram apresentados longe dos botões; uma oferta salva como rascunho não se tornava publicável apenas por ter legenda.
- Uma edição precisava ser salva antes de registrar a publicação. Agora a comparação com a legenda persistida tem mensagem e ação direta.
- A Vercel tinha `TELEGRAM_CHANNEL_ID`; o código antigo só aceitava `TELEGRAM_CHAT_ID`. A compatibilidade foi corrigida, com rejeição de valores conflitantes.
- O agendamento antigo alterava produto/oferta, mas não inseria a tarefa na fila existente. O cron instalado chamava uma rota ausente nesta versão do repositório. A nova rota atende esse mesmo cron.
- Falhas, permissões, operação pendente, entrega incerta e produto publicado agora têm estados visíveis. As verificações de preço, propriedade e duplicação continuam no banco e no servidor.

## 2. Correções e organização

O cadastro completo passou para `/ofertas/nova`. A edição usa `/ofertas/[id-do-produto]/editar`, e a publicação usa `/ofertas/[id-do-produto]`. O cadastro mantém Produto → Oferta → Publicação, preservando dados e prints entre as etapas. Depois de salvar, abre a página de publicação, com Produto, Legenda e Publicação separados. Confirmação e horário usam diálogos menores, com foco, Escape e navegação por teclado.

As saídas por links, recarregamento e controles de fechar/editar avisam sobre alterações não salvas. Os tokens existentes de cor foram mantidos em `workspace.css`. O layout ocupa a tela no celular e mantém os estados e a versão original da legenda. Editar e restaurar não chamam IA. A ação opcional já existente de gerar outra chamada criativa continua explícita.

## 3. Publicar agora no Telegram

1. Abra a oferta salva e confira o produto. Se o preço venceu, use **Abrir loja para conferir** e **Conferir dados atuais**. Confirme preço, variante, disponibilidade e todas as condições usadas na legenda; se algo mudou, escolha corrigir o produto.
2. Salve a edição da legenda, se houver.
3. Clique em **Publicar agora no Telegram**. O backend consulta `getMe`, `getChat` e `getChatMember`, exige canal e permissão de postagem e apresenta seu nome, ID e prévia.
4. Confira o destino e clique em **Confirmar envio ao Telegram**.

O envio usa o ID canônico verificado, vinculado à confirmação por hash. Configuração alterada exige nova confirmação. Metadados ficam em cache por até 60 segundos; uma revogação de permissão também será tratada pela resposta real da Bot API.

Imagem autorizada é enviada por `sendPhoto`. Até 1024 caracteres formatados, usa caption e entities. Acima disso, envia a foto seguida do texto completo por `sendMessage`, em resposta à foto, preservando entities, emojis e link. A legenda da aplicação continua limitada a 4000 caracteres. O recibo de cada parte é persistido antes da próxima chamada.

A reserva atômica impede cliques concorrentes e retries duplicados. Apenas resposta válida, com mensagem e canal correspondentes, permite concluir. Rejeição explícita sem mensagens pode ser autorizada novamente pelo usuário. Timeout, resposta malformada, interrupção ou envio parcial ficam para revisão, sem reenvio automático. IDs, destino, data, tentativas e erros seguros ficam no histórico. A imagem e a legenda são obtidas do snapshot efetivamente reservado.

## 4. WhatsApp manual

**Preparar para WhatsApp** apresenta o próximo passo. **Compartilhar no WhatsApp** usa o compartilhamento nativo quando compatível; o usuário escolhe aplicativo e destino. O fallback abre `wa.me` com o texto completo. **Copiar legenda** mantém emojis, marcações compatíveis e link afiliado.

**Copiar imagem** usa Clipboard API com PNG; quando a plataforma impede a cópia, há **Baixar imagem** e **Compartilhar imagem**. Imagens autorizadas são reutilizadas em memória durante a tela; URLs temporárias de conversão/download são revogadas. Algumas imagens externas podem não permitir leitura pelo navegador por CORS; nesse caso, associe um recorte autorizado pelo cadastro.

Depois de postar, abra **Registrar publicação manual no WhatsApp**, informe grupo/canal, marque a confirmação e clique em **Marcar como publicada**. O registro guarda data, hora, destino e snapshot. Compartilhar, copiar e preparar nunca são tratados como entrega confirmada. A proteção já existente contra uma segunda publicação do mesmo produto foi mantida.

## 5. Agendar e operar a fila

Na oferta salva, clique em **Agendar publicação**, escolha canal, data e horário e confirme. A apresentação é `America/Bahia`; a conversão independe do fuso configurado no computador e o banco armazena `timestamptz`. A antecedência máxima é de 30 dias. A oferta precisa estar conferida ao autorizar.

Reutilizamos `telegram_jobs` e o único cron já instalado, `dropou-telegram-dispatch`, com expressão `* * * * *`. Ele chama `POST /api/telegram/dispatch`, autenticado pelo segredo já armazenado no banco, sem exportá-lo. Não foi criado cron concorrente na Vercel. Cada execução processa no máximo uma oferta; rede, duração e backlog podem causar atraso, portanto não há garantia de envio no segundo exato.

Em **Agendamento**, use **Retomar automação** ou **Pausar automação**. A pausa fica no banco, é verificada na reserva e novamente antes de cada chamada Telegram. Uma requisição externa já iniciada precisa ser conferida; não pode ser desfeita pela pausa. O envio imediato é uma ação manual explicitamente confirmada e não depende de retomar o cron.

Sem conferência de até 15 minutos, o Telegram passa para **Aguardando conferência**. Abra a loja, confira os dados atuais, renove a conferência e clique novamente em publicar ou agendar para autorizar. Um print antigo não renova o preço. A fila não inventa atualização oficial e não consulta OpenAI. Se a validade terminar entre foto e texto, o envio parcial fica retido.

O agendamento WhatsApp passa para **Pronta para compartilhar** quando processado. Exige preço válido antes da preparação promocional e confirmação humana após o envio manual. Não existe disparo não oficial. **Cancelar agendamento** e **Reagendar** ficam na oferta; tarefas já iniciadas/incertas não podem ser repetidas ou canceladas como se nada tivesse sido entregue.

## 6. Limites oficiais mantidos

O Mercado Livre ainda pode negar acesso à busca e ao preço oficial. Nesta entrega, a fila usa conferência humana válida e não renova automaticamente os preços por fontes não autorizadas. Busca, OAuth e consulta oficial manuais existentes foram preservados. Não há scraping.

WhatsApp Web/Share não comprovam postagem em grupo ou canal. Clipboard, compartilhamento de arquivos, abertura de janelas e CORS dependem do navegador. Os fallbacks são explícitos. O Telegram depende de bot administrador, canal configurado, disponibilidade da API e limites do provedor.

## 7. Diagnóstico de performance

Foram encontrados: imports antecipados de cadastro/publicação/ferramentas no dashboard; formulário de edição montando a entrada visual antes de visitar Produto; listener de colagem trocado a cada render do pai; conversões repetidas do mesmo print entre prévia e processamento; worker OCR sem encerramento antecipado ao desmontar; histórico carregado antes de ser expandido; catálogo e histórico sem paginação; URLs privadas assinadas pedidas novamente ao reabrir componentes; refresh de todo o workspace ao salvar legenda.

O OCR já usava import dinâmico e não iniciava Tesseract ao abrir o dashboard. As URLs de prints já eram revogadas no fechamento: a medição inicial não demonstrou vazamento de listeners. Não atribuímos lentidão a esses pontos como se fossem falhas novas. Também não foi identificado loop de efeito nem consulta por caractere no editor.

## 8. Melhorias aplicadas

- Páginas dedicadas e módulos dinâmicos para cadastro, publicação, leitura visual, busca, integrações, consumo de IA e detalhes. Tesseract continua carregado apenas na ação OCR.
- Ferramenta visual montada na edição apenas quando Produto for visitado, sem perder prints entre etapas. Canvas inativo não é redesenhado.
- Listener estável com callbacks atuais. Cache por instância de canvas e Blob comprimido por print/recorte, invalidado em alterações e removido no fechamento. Base64 não fica em estado global.
- Workers encerrados em sucesso, falha, fechamento e criação tardia após fechamento. URLs, imagens decodificadas e canvases liberados. Resultados assíncronos descartados após desmontar.
- Catálogo: 24 produtos por página, busca por nome no servidor com debounce de 250 ms, contadores globais separados. Categoria/status/data filtram a página atual, informado na tela. Ofertas apenas dos produtos carregados.
- Históricos: 20 itens por página, carregados quando abertos. Página de uma oferta consulta apenas o produto selecionado. Salvamento de legenda atualiza a tela local.
- Assinaturas de imagens privadas com requisições concorrentes deduplicadas e cache de 240 segundos, limitado a 64 entradas, separado por usuário e invalidado ao excluir/sair.

## 9. Métricas e limites da medição

Reprodução: `npx tsx scripts/profile-publication.ts docs/performance-after.json`, após `npm run build`. React development Profiler em jsdom: dez ciclos de abrir/fechar cadastro novo, seis renders do pai por ciclo. A versão com lazy loading teve um commit adicional de carregamento. Não se trata de tempo de digitação ou latência real de navegador.

| Medida | Antes | Depois |
| --- | ---: | ---: |
| JavaScript inicial do dashboard, bytes | 1.065.485 | 977.088 |
| Soma gzip dos scripts iniciais, bytes | 313.094 | 287.915 |
| Registros / remoções de listener de colagem | 60 / 60 | 10 / 10 |
| Listeners restantes após fechar | 0 | 0 |
| Commits medidos | 60 | 61 |
| Tempo acumulado do Profiler, ms | 621 | 735 |
| Requisições da fixture | 0 | 0 |

O bundle comprimido caiu cerca de 8% e as trocas do listener, 83%. **O tempo desta medição não melhorou**; não há evidência para prometer cadastro mais rápido em milissegundos. jsdom, desenvolvimento, carregamento dinâmico e variabilidade local limitam a comparação. Os valores brutos estão em `performance-before.json` e `performance-after.json`.

O teste de processamento comprovou uma decodificação e uma compressão para prévia + duas preparações do mesmo recorte; editar o recorte invalida o cache. Dez ciclos com colagem terminaram com zero URLs ativas. O teste do worker comprovou uma terminação por instância, inclusive criação tardia. Isso valida liberação dos recursos controlados, não constitui heap snapshot ou prova de ausência de qualquer vazamento.

A ferramenta de navegador retornou `apps: []`, `browsers: []`. Chrome Performance, heap snapshots, Lighthouse e avaliação visual real em celular não puderam ser executados nesta sessão. Devem ser medidos no navegador do administrador antes de afirmar ganhos de experiência real.

## 10. Validação

Suíte completa: **100 testes passaram**, incluindo regressões anteriores de IA/cache/orçamento, OCR, OAuth, RLS, editor e histórico. Os testes novos cobrem canal/permissão, envio com imagem e texto longo, 403, rede, timeout, recibo inválido, entrega parcial, recibos entre etapas, pausa/expiração antes de cada chamada, reserva duplicada, retry explícito de falha confirmada, agendamento futuro, cancelamento, reagendamento, conferência humana, WhatsApp sem publicação automática, destino e timestamp, cópia de texto/PNG, limpeza de canvas/URLs/worker e abertura repetida.

TypeScript e build passaram. As chamadas externas de publicação e geração são simuladas nos testes. Supabase real: migração aplicada, RLS e grants conferidos, automação pausada, um único cron e contagens preservadas (4 produtos, 3 ofertas, 0 publicações e 0 jobs na verificação). Health advisors sem avisos; tabelas privadas continuam inacessíveis aos clientes.

## 11. Deploy e configuração

A migração aplicada é `20261106150839_publication_dispatch_and_review.sql`. O segredo existente do dispatcher não foi alterado nem exportado, e o cron existente já aponta para a rota atendida. Não é necessário adicionar outro scheduler.

A Vercel precisa manter `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHANNEL_ID` ou `TELEGRAM_CHAT_ID`, configuração pública Supabase e `SUPABASE_SECRET_KEY` no backend. O administrador precisa constar em `telegram_dispatch_config.owner_ids`. A pausa da nova fila é controlada pela tela Agendamento; o antigo `ENABLE_AUTOMATIONS` não ativa esta fila. A fila inicia pausada, e os testes não a retomam.

Deploy de produção realizado em [dropou-automation.vercel.app](https://dropou-automation.vercel.app). As páginas inicial e de criação responderam HTTP 200; workspace, configuração, fila e diagnóstico interno recusaram acesso anônimo com HTTP 401.

O diagnóstico autenticado servidor → servidor respondeu HTTP 200 e confirmou o canal **Dropou | Tech & Games 🎮**, ID `-1003981538831`, e a permissão de postagem do bot, mantendo `paused=true`. O segredo foi usado internamente por `pg_net`, sem ser exportado para esta máquina. Foram chamadas apenas as operações de metadados do Telegram; nenhum `sendPhoto` ou `sendMessage` real foi executado.

Não há configuração de Telegram pendente detectada. Envio real continua dependendo da confirmação do administrador, e a automação deve ser retomada pela tela quando desejado. Clipboard/Share precisam de teste no navegador e dispositivo usados para postar. Nenhum teste marcou produto real como conferido ou publicado.

Referências: [Telegram Bot API](https://core.telegram.org/bots/api), [pg_cron + pg_net no Supabase](https://supabase.com/docs/guides/functions/schedule-functions), [limites de cron da Vercel](https://vercel.com/docs/schedules/cron-jobs/usage-and-pricing), [Web Share](https://developer.mozilla.org/en-US/docs/Web/API/Navigator/share), [Clipboard.write](https://developer.mozilla.org/en-US/docs/Web/API/Clipboard/write).

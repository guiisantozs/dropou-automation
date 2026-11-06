# Capa, exclusão e funis independentes

Implementação local concluída e validada em 6 de novembro de 2026. Migração e publicação desta etapa ainda não aplicadas em produção.

## Causa do bug

O Telegram não estava criando linhas falsas na tabela WhatsApp nos dados inspecionados. O erro vinha do uso de um **estado global como se fosse estado de canal**:

1. `dropou_publication_receipt` gravava `publicado` em `products.data.status` e `offers.status` após um recibo Telegram.
2. `dropou_workspace_metrics` e o resumo da interface usavam esse estado para contar publicações. O bloqueio comum também tratava qualquer publicação como impedimento para os dois canais.
3. Guards impediam uma confirmação WhatsApp quando existia entrega/agendamento Telegram. A fila tinha unicidade somente por produto/oferta, impedindo dois agendamentos independentes.

A correção altera as funções, relações, consultas e estados React. A publicação deixa de ser inferida pelo status global do cadastro. A curadoria de preço permanece separada da situação de cada canal.

## Diagnóstico dos registros reais

Leitura de produção encontrou **2 entregas Telegram confirmadas e nenhuma linha em `publications`**, que é a tabela de confirmações WhatsApp.

| Produto | ID do produto | Recibo Telegram | Correção preparada |
| --- | --- | --- | --- |
| EA Sports FC 27 — PS5 | `62fa96cd-20b4-4e4f-ac17-1e910e39f3b3` | mensagem `11` | Retirar a classificação global de publicado; preservar prova e histórico Telegram |
| Fonte Gamemax GS600 600 W | `3f08b5e8-894f-4a45-a6b2-0cc6690f8778` | mensagem `13` | Mesma correção, sem criar confirmação WhatsApp |

Esses dados reais ainda não foram alterados por esta etapa. A migração aplica a correção de forma geral apenas quando há evidência de entrega ou confirmação manual. Não apaga publicações legítimas. Registros WhatsApp antigos sem evidência positiva de confirmação manual ficam preservados com `review_required`, fora dos contadores confirmados, e podem ser revisados explicitamente pelo proprietário. A revisão registra quem confirmou e o horário atual, preservando a data histórica original.

## Telegram com capa

Com foto disponível e autorizada, o envio usa `sendPhoto`, legenda em `caption` e `show_caption_above_media: false`. Texto em negrito, texto riscado e URLs recebem entidades explícitas, preservando o link afiliado original. A imagem fica antes da legenda. Não há segunda prévia do link na mensagem de foto. Isso segue a [Telegram Bot API](https://core.telegram.org/bots/api#sendphoto).

A capa usa primeiro a foto de publicação armazenada (`imagePath`), depois a imagem original autorizada (`image`). A miniatura do catálogo (`thumbnailPath`) não é enviada como capa. Não há busca aleatória, geração de imagem ou envio de prints à OpenAI.

Na oferta, **Selecionar ou trocar a foto sem refazer a oferta** permite escolher uma foto/recorte já preparado, revisar, autorizar o armazenamento e salvar somente a imagem. A preparação converte para JPEG e limita a dimensão maior a 1.600 pixels; o upload permanece limitado a 2 MB. Preço, validade da conferência e legenda não são regenerados. Agendamentos que dependiam da foto anterior ficam aguardando nova autorização.

O administrador escolhe explicitamente entre:

- Foto acima da legenda, com autorização de uma imagem sem condições comerciais escritas que possam ficar desatualizadas.
- Solicitação de prévia do link acima do texto. Usa `link_preview_options.show_above_text`; o Telegram pode não gerar a prévia. Não há promessa de foto nessa opção. Veja [LinkPreviewOptions](https://core.telegram.org/bots/api#linkpreviewoptions).
- Somente texto, com prévia automática desativada.

Sem foto, a tela informa **“Adicione uma foto para publicar com capa acima da legenda.”** Não há mudança silenciosa para texto. Arquivos privados inexistentes são recusados antes de autorizar o envio.

Legendas acima do limite de caption são mostradas como duas mensagens vinculadas: foto primeiro e texto completo depois, com prévia de link desativada na segunda mensagem. A interface avisa isso antes da confirmação. Todos os IDs recebidos são preservados na mesma publicação lógica. Falha parcial ou timeout ficam bloqueados para revisão, sem reenvio automático nem truncamento.

## Funil de cada canal

O dashboard tem abas **Telegram | WhatsApp**, contadores próprios, situação das ofertas e histórico de tentativas. As respostas antigas de uma aba são descartadas depois de mudar de canal.

Telegram só fica publicado após resposta válida da Bot API, com ID positivo e o canal esperado. A fila usa chave por **produto + canal** e mantém recibos, tentativas, destino, erros e rodadas de publicação. WhatsApp usa confirmações manuais com destino, proprietário que confirmou e horário. Salvar, gerar, preparar, copiar e abrir o WhatsApp não criam confirmação.

Dentro da oferta, as situações e os botões são independentes. Publicar no Telegram permite continuar preparando ou confirmando WhatsApp, e uma confirmação WhatsApp não impede Telegram. Cancelar um agendamento identifica explicitamente o canal.

Uma **republicação intencional** exige autorização adicional para aquele canal, antes da confirmação normal do envio ou do registro manual. A autorização é de uso único e idempotente; o histórico anterior permanece preservado. Cliques repetidos ou reutilização do mesmo comprovante não criam novas publicações. Envios incertos/parciais não podem usar esse caminho para repetir mensagens.

## Excluir, arquivar e restaurar

Use **Catálogo → Ações → Excluir produto**, o painel de detalhes ou a página da oferta.

O diálogo consulta vínculos e permissões antes de confirmar. Sem publicação anterior, pode excluir o cadastro e os rascunhos. Com histórico, arquiva o produto e preserva ofertas, recibos, confirmações e logs. Também é possível escolher arquivamento mesmo sem histórico, para restaurar depois.

Se houver agendamentos pendentes, o administrador precisa autorizar seu cancelamento nos dois canais. Um envio em andamento impede a exclusão. Recibos parciais/incertos permanecem preservados. Excluir o produto nunca chama `deleteMessage` nem apaga mensagens Telegram.

No catálogo, **Arquivados / restaurar** abre os produtos arquivados. Restaurar não reativa agendamentos cancelados nem repete publicações.

A opção de limpar arquivos só remove imagens próprias sem referência em produto, oferta, confirmação ou histórico. A verificação e a reserva do caminho usam bloqueios compartilhados com a gravação de novas referências; um caminho reservado para remoção não pode ser associado novamente. O Storage é alterado pela API oficial, fora do SQL. Falha na limpeza é informada separadamente, sem fingir que a exclusão já confirmada do cadastro falhou. Imagens usadas no histórico ou em outros produtos são mantidas.

## Migração e segurança

Fonte: [20261106193213_channel_funnels_product_lifecycle.sql](../supabase/migrations/20261106193213_channel_funnels_product_lifecycle.sql). Foi criada pelo CLI do Supabase e testada em PGlite; depende do esquema existente e da atualização anterior de conferência opcional.

A migração acrescenta arquivamento, metadados de confirmação manual e apresentação da mídia, substitui unicidades globais por escopo de canal e acrescenta auditoria de eventos, autorizações de republicação e reservas de imagens removidas. Usa `security invoker`, RLS por proprietário, funções de serviço restritas ao backend e consumo de autorização WhatsApp com permissão apenas sobre a coluna necessária. Não há `SECURITY DEFINER`, nova integração ou alteração de autenticação.

As operações seguem bloqueio por produto e vínculos explícitos ao canal. A consulta de produtos ativos e os históricos têm índices compatíveis com seus filtros. A fila antiga sem escolha explícita de apresentação fica aguardando revisão, preservando data e registro, em vez de publicar texto automaticamente.

Não houve alteração em modelos, prompts, geração OpenAI, orçamento, cache, Mercado Livre, Shopee, chaves, cron ou identidade visual principal. Não foram adicionadas dependências. A automação real continua pausada.

## Validação

- **138 testes passaram**, sem falhas: inclui banco isolado, interfaces simuladas, histórico legado, RLS, contadores, agendamentos simultâneos, cancelamento por canal, fotos, legendas longas, URLs, idempotência, republicação explícita, exclusão, restauração, imagens compartilhadas e ausência de novas chamadas de IA.
- TypeScript, build de produção e `git diff --check` passaram.
- Testes antigos de esquema anterior continuam preservando suas publicações no banco; o contador atual exige evidência manual e mantém esses formatos antigos sem atribuição até a revisão/migração.
- Nenhuma publicação real ou chamada paga foi executada nos testes. Nenhum produto real foi excluído.
- Não havia navegador conectado às ferramentas. Portanto, não foram produzidas capturas desktop/mobile nem QA visual real. Clipboard, compartilhamento nativo, seleção de foto e apresentação final devem ser conferidos no navegador após a implantação.

## Implantação pendente

O código e a migração precisam ser implantados juntos. Após autorização: conferir novamente o estado remoto, aplicar a migração, verificar os dois históricos e as permissões, enviar o commit ao `main`, publicar na Vercel e conferir o domínio de produção. Manter a automação pausada e não publicar mensagens de teste.

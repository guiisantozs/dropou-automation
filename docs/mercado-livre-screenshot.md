# Captura do Mercado Livre e diagnóstico da curadoria

No cadastro de uma oferta, informe o link Mercado Livre e abra **Adicionar print ou foto**. Cole a captura ou selecione até três arquivos do mesmo anúncio. O OCR português existente começa automaticamente, no navegador, usando as capturas completas. A leitura paga existente continua sendo uma ação explícita; o recorte não faz chamadas à OpenAI.

A seção **Fotografia para a publicação** compara a captura original e o recorte. Confira a foto e autorize seu armazenamento ao salvar. **Ajustar recorte** permite arrastar uma região ou ajustar quatro controles pelo teclado. **Usar captura original** exige uma escolha explícita e sua própria autorização; **Manter imagem atual / não usar recorte** conserva a apresentação anterior. Alterar o enquadramento revoga a autorização anterior. A leitura que terminar depois de um ajuste manual não substitui a escolha do usuário.

## Implementação

- `image-input.tsx` reaproveita o Tesseract, cache de preparação e ciclo de vida do worker. As caixas das palavras reconhecidas são normalizadas por captura. Para Mercado Livre, as análises gratuitas e a leitura visual opcional usam a imagem inteira, independentemente do recorte de publicação.
- `screenshot-photo.ts` segmenta uma amostra de até 640 pixels no maior lado, ignora as caixas de texto apenas durante a localização e procura uma região dominante separada da interface. Exige leitura OCR, margem livre e ausência de preço/botões no enquadramento. Imagens alternativas de tamanho parecido, produto cortado na borda ou sobreposição de controles pedem ajuste manual. Nenhum pixel é apagado ou recriado.
- `screenshot-photo.tsx` aplica as coordenadas aos pixels da captura original por `ImagePreparation`, antes da redução, preservando a proporção. Exporta JPEG de até 2 MB, com no máximo 1.600 pixels no maior lado e sem ampliar. As URLs temporárias e canvases são liberados ao trocar a seleção ou fechar o cadastro.
- `mercado-livre-screenshot.ts` complementa o parser existente com marca, modelo, variante e condição somente quando explicitamente legíveis por rótulos. Ignora as recomendações seguintes. `visual.ts`, `ocr.ts` e `domain.ts` transportam esses dados; condição fica editável em **Características e condições comerciais**. Dados continuam sujeitos à revisão humana.
- `product-form.tsx` exige consentimento e envia apenas a foto escolhida ao salvar. `product-image-upload.ts` usa a rota privada existente e informa a operação explicitamente. O caminho retorna em `imagePath`; uma miniatura antiga é retirada da nova oferta para não ocultar a foto atualizada. Produto e snapshot da oferta reutilizam esse caminho nos cards, catálogo, prévias e publicação. Um novo clique após falha de salvamento reutiliza o upload da mesma foto/operação.
- Nenhum endpoint, bucket, tabela, dependência ou migração foi acrescentado. RLS, referências históricas e transporte Telegram permanecem existentes. WhatsApp continua manual.

## Limitações

A localização é geométrica e conservadora, não identifica semanticamente todo produto. Fundo escuro, produto muito claro sem contorno, partes separadas, sobreposição de miniaturas, baixa resolução ou vários produtos podem exigir recorte manual. A fotografia terá a resolução disponível na captura e compressão JPEG. O OCR pode confundir caracteres; no teste real sintético, leu `A55` como `ASS`, demonstrando a necessidade de conferir modelo e variante. Não atribui uma cor pela aparência nem comprova estoque, validade ou comissão.

Na primeira leitura, o Tesseract baixa bibliotecas e o modelo público de português. As imagens são analisadas localmente. A opção paga existente pode enviar cópias otimizadas à API visual somente após seu clique. O print completo permanece em memória, exceto quando o usuário escolhe e autoriza explicitamente guardá-lo como imagem da oferta.

## Curadoria Shopee no site publicado

Leitura remota confirmou uma tentativa do usuário em **15/11/2026 às 15:41 UTC**, marca Dropou, concluída com estado `provider`. A classificação registra erro transitório do provedor; o registro antigo não guarda HTTP/código suficiente para determinar se aquela chamada teve HTTP 5xx, erro de rede ou GraphQL `10000`. Não houve evidência de bloqueio por orçamento nessa tentativa.

A busca padrão também deixou de começar pelo formato `listType=2, sortType=2, keyword=gamer`, que tinha uma resposta bem-sucedida no histórico de 13/11. `onDemandKeywords` restaura essa consulta inicial apenas no Tech & Games padrão, mantendo filtros de relevância, famílias seguintes, termos personalizados e perfis dos outros canais. Isso não garante que a Shopee volte a responder.

`on-demand.ts` distingue rodada completa, parcial e falha. Erro não vira mais “0 resultados encontrados”: preserva a curadoria, apresenta diagnóstico seguro HTTP/código quando disponível e horário de nova tentativa. Conta apenas reservas efetivadas, respeita orçamento/cooldown e interrompe a rodada no primeiro erro, sem retry oculto. `shopee-search-feedback.ts`, `product-operations.tsx` e `shopee-tools.tsx` apresentam o aviso depois da releitura, evitando que ele seja apagado pela atualização da lista. Nenhum segredo ou corpo bruto do provedor vai ao diagnóstico.

## Validação executada

- `npm.cmd test`: **320/320**, com fixtures, HTTP simulado e PGlite. Casos novos cobrem três dimensões, produto branco, miniaturas, alternativas ambíguas, bordas, interface, metadados visíveis, consentimento, ajuste após OCR, original explícito, liberação de memória, cota negada sem HTTP, erro GraphQL contabilizado uma vez, resultado parcial e aviso persistente após releitura.
- `npm.cmd run typecheck` e `npm.cmd run build` aprovados. `git diff --check` sem erros.
- `scripts/review-ml-screenshot.ts`: aplicação Next real no Chrome, sessão fictícia, OCR português real e assets servidos localmente. Captura sintética 1.280 × 800 gerou fotografia 474 × 492; leitura automática, comparação em 320/375/768/1440 px sem overflow, bloqueio de upload sem consentimento, upload único vinculado a Celulares, produto/snapshot com `imagePath` e foto na prévia passaram. Capturas desktop/mobile inspecionadas. Todas as APIs e escritas foram interceptadas; não comprova Storage remoto nem uma entrega real.
- Evidências locais ignoradas em `outputs/screenshot-review/`. Para reproduzir, disponibilize `por.traineddata.gz` oficial nessa pasta e execute `npm.cmd exec -- tsx scripts/review-ml-screenshot.ts` com Next local ligado e Chrome instalado. O roteiro atende a um ambiente de teste, nunca autentica uma conta real.
- Sem busca Shopee de teste, postagem, geração paga, alteração remota do banco, limite, cron, destino, credencial ou ativação de rotina. O servidor local permanece disponível para acompanhamento.

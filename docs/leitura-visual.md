# Leitura visual e colagem de prints

Implementação de 06/11/2026. Código local, ainda sem publicação no GitHub/Vercel. A extensão do banco já foi aplicada e verificada no Supabase existente. Nenhuma chamada paga ou envio de publicação foi feito.

## Fluxo

Cole o link de afiliado, tire o print com Windows + Shift + S e use Ctrl + V no cadastro. A área também aceita arrastar arquivos e selecionar imagens da galeria, inclusive em dispositivos móveis. Até três prints do mesmo anúncio podem complementar a leitura; o primeiro é tratado como principal. É possível selecionar, suabstituir, remover e recortar cada imagem. A leitura só começa pelo clique em Gerar oferta ou Ler gratuitamente com OCR.

O botão Colar imagem usa `navigator.clipboard.read()` apenas por ação explícita e em contexto seguro. Sem suporte ou permissão, a interface orienta usar o evento de colagem pelo teclado ou seleção de arquivo. Colagem de texto em campos continua normal.

As imagens ficam em memória como arquivos/Blob URLs, revogados ao remover ou fechar o formulário. PNG, JPEG e WebP são aceitos com limite de 8 MB por arquivo. Antes da análise, o navegador preserva proporção, reduz a maior dimensão para até 1600 pixels e prepara JPEG com até 750 KB. O recorte é ajustável; não há corte automático que possa esconder o preço ou a variante. O backend limita o corpo a 3,3 MB e confere assinatura, dimensões e tamanho das imagens otimizadas. O conteúdo não é gravado em disco, no Supabase Storage ou na tabela de cache.

Uma única Responses API recebe as imagens otimizadas e devolve os dados e uma chamada criativa. Não há ferramentas, geração de imagem, histórico, retry automático ou segunda chamada para formatar texto. `store:false` é enviado à OpenAI. O link de afiliado não vai para o modelo: o backend associa exatamente o link fornecido pelo administrador.

O resultado inclui nome, marca, modelo, variante/cor, preço, referência anterior, desconto exibido, condição de pagamento, parcelamento, avaliação, vendas, características, vendedor, chamada e campos incertos. Campos ausentes são `null`. Classificações adicionais de contexto permitem descartar preços de recomendações, cupom, comissão e variantes ambíguas. GANHOS não vira desconto. Uma porcentagem incompatível com os preços é omitida. Economia e percentual são calculados em centavos pelo código.

Os campos são preenchidos; somente os incertos recebem destaque. O cadastro manual fica como opção avançada. A prévia mostra a oferta pronta com indicação de que os dados vêm do print. Revise ou corrija o resultado e confirme as condições visíveis. Uma confirmação separada de preço, condição de pagamento e disponibilidade atuais na loja permite publicação; a captura sozinha nunca faz isso. Sem essa conferência, salvar mantém o rascunho histórico. A validade de 15 minutos continua aplicada no frontend, nas rotas e no banco.

Salvar produto e oferta exige um clique e não chama OpenAI. A chamada criativa acompanha o produto e pode ser reutilizada ao revalidar ou abrir a prévia. A formatação continua local, com marca, preços, condições, publicidade, link e encerramento. WhatsApp manual, Telegram oficial e agendamento continuam usando o fluxo existente.

## Imagem de publicação

O padrão é usar a prévia automática do link, quando o Telegram disponibilizar. Alternativas: URL original de fonte autorizada ou recorte do produto. Guardar um recorte exige marcar autorização e clicar na ação separada de armazenamento; o backend também exige esse consentimento. Isso é independente de analisar o print. Não há geração de imagens artificiais.

O botão de exclusão remove a imagem guardada pelo próprio usuário. Exclusão é bloqueada enquanto houver agendamento ou envio em andamento que dependa dela. O histórico textual permanece. Uma imagem excluída não será disponibilizada por URL assinada como se ainda existisse. Os prints usados apenas para análise nunca exigem exclusão no Storage, pois não foram enviados para lá.

## Cache e orçamento

`ai_visual_cache` armazena hashes SHA-256 e o objeto extraído, sem base64, bytes, arquivos ou link de afiliado. A chave inclui ordem das imagens, modelo, marca e versão do prompt. Assim o mesmo resultado pode ser associado ao link original recebido em cada pedido. Cache não afirma validade de preço: a montagem de um novo cadastro sempre inicia sem conferência atual.

As novas funções usam a mesma linha bloqueada de `ai_budget` e a mesma tabela `ai_requests` do gerador textual. Reserva e prevenção de pedidos simultâneos são atômicas; uma segunda solicitação do mesmo print não cria outra chamada. Quota, Retry-After, limites diários e operacionais, falhas incertas e custo por tokens mantêm o tratamento já existente. Falhas ou orçamento indisponível acionam Tesseract.js e template local. OCR não requer OpenAI nem persistência de imagem.

O campo `kind` distingue legenda de análise visual no ledger. Consumo de IA mostra chamadas visuais, leituras visuais do cache e custo visual incluído no total. Após resposta válida, o custo estimado usa a quantidade efetiva de tokens de entrada, saída, leitura e escrita de cache reportados pelo provedor. Falhas sem consumo verificável retêm a reserva; ela não é tratada como crédito disponível.

## Custo e ativação

Modelo padrão: `gpt-6-luna`, com entrada de imagem e saída textual pela Responses API. Tarifas Standard verificadas: US$ 0,10 por milhão de tokens de entrada; US$ 0,50 de saída; US$ 0,01 para leitura em cache e US$ 0,125 para escrita de 30 minutos.

Reservas internas conservadoras por chamada, incluindo extração e chamada criativa:

| Prints na mesma chamada | Reserva estimada em US$ |
|---|---:|
| 1 | 0,005570 |
| 2 | 0,009666 |
| 3 | 0,013762 |
| Resultado recuperado do cache | 0,000000 de nova chamada |

Esses valores são a reserva de segurança, não um orçamento de faturamento garantido nem um custo real medido. Usam uma margem fixa para o prompt, uma permissão conservadora de tokens por imagem e até 900 tokens de saída. A documentação de dimensionamento consultada não enumera o multiplicador exato do Luna; não foi inventado um valor de tokenização específico. A reserva é acertada pelos tokens da resposta. O custo final da primeira imagem ainda depende do teste autorizado e do faturamento real. Gastos de outras aplicações continuam externos ao ledger.

Na Vercel, manter chave OpenAI e chave secreta Supabase somente no backend. Além da configuração já descrita em `ia-economica.md`, adicionar:

```text
OPENAI_VISION_ENABLED=false
```

Depois de autorizar o primeiro teste pago, definir como `true` no ambiente desejado, com `OPENAI_ENABLED=true`, allowlist administrativa e autorização manual em Consumo de IA. A flag permanece desligada por padrão. Não foi exportada nenhuma chave para `.env.local`. Não é necessário colocar a chave local para usar a implantação da Vercel.

Instalação em outro banco: aplicar `ai-visual.sql` depois de `ai-economy.sql`. A extensão é idempotente, mantém o orçamento atual e preserva as integrações anteriores. O projeto existente foi inspecionado antes de aplicar a alteração.

## Evidências e limites da validação

- Suíte de 76 testes aprovada, incluindo as regressões de Supabase, OAuth, Telegram e WhatsApp. TypeScript e build aprovados.
- Eventos reais do componente React em jsdom: paste com múltiplos arquivos, drag/drop, seleção, substituição, remoção, permissão negada, atualização imediata dos elementos de imagem e liberação de Blob URLs. Não há upload nem chamada ao provedor ao colar.
- Confirmação humana e clique de salvar testados no formulário, mantendo o link original, a origem screenshot, a chamada criativa e os valores; nenhuma segunda chamada paga.
- PNG/JPEG/WebP testados na admissão de arquivos. Decodificação/canvas são simulados no DOM de teste; não equivalem a teste de codecs em navegadores reais.
- Dados simulados cobrem vírgula decimal, preço de relacionado, comissão de afiliado, cupom, múltiplos preços, modelo, variante selecionada, ausência de dados e cálculo de economia.
- API OpenAI simulada: várias imagens e chamada em uma requisição, cache isolado por usuário e marca, duplicação simultânea, orçamento global, 429 de quota, Retry-After, timeout, custo e privilégios do banco.
- Banco remoto verificado: orçamento continua 4,50/0,50/100, geração paga desativada, zero chamadas visuais e zero entradas no cache visual; `anon` e `authenticated` não podem ler o cache nem invocar a reserva. Nenhuma nova advertência WARN dos advisors; INFO de RLS sem políticas é intencional nas tabelas exclusivas do backend. Advertências antigas estão registradas em `ia-economica.md`.
- HTTP local: GET/POST da rota visual e DELETE de imagem retornam 401 sem autenticação.
- O ambiente não expõe navegador conectado. Portanto, Ctrl + V físico no Windows, aparência e comportamento em navegadores móveis, OCR com arquivos reais e qualidade do reconhecimento visual real ainda precisam de validação prática. Não foram apresentados resultados simulados como leitura de um anúncio real.

O administrador autorizou a publicação desta versão e um único teste visual pago. O teste aguarda publicação/configuração e um print de produto. Deve realizar uma única análise; uma repetição idêntica deve confirmar o cache sem segunda chamada paga. Esse teste não publica mensagens.

Fontes: [modelos com imagem no changelog oficial](https://developers.openai.com/api/docs/changelog), [GPT-6 Luna e tarifas](https://developers.openai.com/api/docs/models/gpt-6-luna), [entrada de imagem na Responses API](https://developers.openai.com/api/docs/guides/images-vision), [Clipboard.read](https://developer.mozilla.org/en-US/docs/Web/API/Clipboard/read), [evento de colagem](https://developer.mozilla.org/en-US/docs/Web/API/ClipboardEvent/clipboardData), [exclusão de arquivos no Supabase](https://supabase.com/docs/reference/javascript/storage-from-remove).

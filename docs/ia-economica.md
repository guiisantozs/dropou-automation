# Dropou AI econômico — implementação e validação

Data: 06/11/2026. O código desta implementação está na pasta local. Um redeploy anterior da Vercel não inclui alterações locais que ainda não foram enviadas ao provedor.

Evolução do cadastro: [colagem de prints e leitura visual em uma chamada](leitura-visual.md). A leitura visual é opcional, tem ativação separada e compartilha este orçamento.

## Comportamento

Em Cadastrar produto, cole o link de afiliado e clique em Obter dados. O domínio identifica Mercado Livre/Shopee, sem seguir encurtadores. O link completo, incluindo query string, é preservado. Após as recusas HTTP 403, a consulta individual do Mercado Livre exige a autorização adicional `MERCADO_LIVRE_LOOKUP_APPROVED=true`; a Shopee continua pendente de aprovação. Não existe scraping nem tentativa de contornar recusas.

Sem consulta autorizada, anexe um print e use Ler print gratuitamente. Tesseract.js é carregado somente por esse clique; o reconhecimento acontece no dispositivo. Código e modelo de idioma podem ser baixados do CDN do Tesseract; a imagem não é enviada ao CDN nem à OpenAI. Nome, valores, parcelamento e características são sugeridos, sem assumir validade atual, estoque ou comprovação de referência anterior. Leituras ambíguas ficam para correção. Condições opcionais têm confirmações independentes e não precisam ser preenchidas.

O recorte usa canvas local. Usar imagem recortada na oferta envia apenas a imagem escolhida ao bucket privado `offer-images`; URLs assinadas duram cinco minutos. O backend exige que o caminho pertença ao usuário autenticado. Não há geração de imagens.

Salvar produto abre a prévia, sem chamada paga. Gerar oferta solicita uma versão por padrão, ou três na mesma requisição. A OpenAI produz apenas a chamada criativa; nome, preços, economia em centavos, características e parcelamento confirmados, publicidade, link original e encerramento são montados localmente. Chamadas com números, URLs ou alegações comerciais proibidas são substituídas pelo template. O objetivo editorial é 60–100 palavras, sem completar artificialmente textos de produtos com poucos dados. Marcas disponíveis: Dropou Tech & Games, Amiga Tá Barato e Amiga Tá Linda.

Copiar, editar texto, salvar, publicar e agendar não consultam OpenAI. A prévia carrega a legenda salva quando os dados correspondem. Mudanças relevantes invalidam a prévia. Ao vencer a conferência de 15 minutos, a cópia promocional e a publicação ficam bloqueadas. Cache não renova preço. Prints exigem confirmação humana também no banco.

WhatsApp permanece manual. Telegram usa Bot API, com imagem opcional e entidades de negrito/tachado sem modificar o link. Reserva de envio e registro do resultado ficam no banco; timeout mantém o envio retido para revisão. A fila instalada anteriormente é preservada e protegida contra duplicação com a nova fila. Agendamentos sem fonte autorizada ficam aguardando nova conferência humana; conferir um print antigo não substitui a visita à loja. Automação continua pausada por padrão e requer configurar o cron e fontes autorizadas para despacho automático.

## Configuração no backend da Vercel

Variáveis privadas:

```text
OPENAI_API_KEY=<chave já criada pelo administrador>
OPENAI_MODEL=gpt-6-luna
OPENAI_ENABLED=true
AI_ADMIN_USER_IDS=<UUID(s) do Supabase Auth, separados por vírgula>
SUPABASE_SECRET_KEY=<chave secreta do projeto Supabase>
```

`SUPABASE_SERVICE_ROLE_KEY` é alternativa à chave secreta. Nenhuma dessas chaves deve usar `NEXT_PUBLIC_`. Sem habilitação, autorização ou banco disponível, o fluxo continua com templates gratuitos. O modelo padrão é Luna; substituir `OPENAI_MODEL` exige configurar e verificar os preços de entrada, entrada em cache, escrita de cache e saída em `.env.example`. Não existe troca automática de modelo nem uma segunda chamada para corrigir parâmetros.

O administrador também precisa marcar Autorizar geração paga em Consumo de IA. Essa alteração não gera texto nem gasta crédito. Nenhum processamento automático pago foi criado.

Banco, para instalações novas: `schema.sql` → `whatsapp-flow.sql` → `ai-economy.sql` → `telegram-offers.sql` → `offer-images.sql`. No projeto existente, as três extensões finais já foram aplicadas pelo conector Supabase e verificadas. Não reaplicar o schema inicial. As funções novas usam o prefixo `dropou_economy_` para preservar as funções de IA/Telegram que já existiam remotamente.

## Cache e orçamento

SHA-256 do produto/ID oficial, marketplace, dados verificados relevantes, preço/condições, link rastreável, perfil da marca, modelo, quantidade de versões e versão do prompt. Data de nova conferência sem mudança de condições não invalida a legenda; a validade do preço é verificada separadamente. Cache não tem expiração comercial implícita.

`ai_caption_cache` persiste dados usados, produto, marca, modelo, prompt, textos e data. A relação `request_id` aponta para tokens, tarifas e custo da requisição em `ai_requests`; em lotes, o custo pertence à chamada inteira, sem inventar rateio por produto. Lotes de até 20 produtos são divididos em grupos de até cinco. Só faltas de cache reservadas atomicamente chegam ao provedor. Dados insuficientes são ignorados. Produtos com geração em andamento não geram outra chamada.

O ledger global corresponde a uma chave/projeto OpenAI, compartilhado entre administradores desta aplicação. Uma linha bloqueada com `FOR UPDATE` serializa a checagem de gastos, reservas e chamadas. A transação termina antes de consultar a OpenAI. Reserva conservadora usa bytes de entrada, margem de protocolo e limite de saída, considerando a tarifa de escrita de cache. O acerto usa tokens reais, incluindo leitura e gravação de cache. Tarifas são armazenadas junto à chamada. Sem resposta verificável, a reserva permanece: nunca liberar automaticamente uma chamada cujo consumo é desconhecido.

Limites iniciais: US$ 4,50 acumulados desde a instalação, US$ 0,50 por dia e 100 requisições por dia. O orçamento operacional não se renova mensalmente. O painel também mostra custo do mês, histórico por dia em São Paulo, legendas, chamadas, cache e tokens. A reserva de US$ 0,50 sobre a recarga de US$ 5 não é saldo consultado na OpenAI; gastos de outras aplicações, impostos e faturamento real continuam externos.

Não há retries automáticos. `insufficient_quota` desabilita geração paga no ledger até nova ativação explícita. 429 transitório grava um bloqueio até Retry-After, respeitado por novos cliques. Erros de rede/5xx sem consumo verificável retêm reserva e chave pendente. Template local mantém a oferta utilizável. Alterações manuais de reserva exigem conferir o faturamento antes; não foi criado um botão que descarte despesas incertas.

## Verificações realizadas

- Suíte completa de regressão: 60 testes aprovados, incluindo 20 testes no arquivo `ai.test.ts` e coexistência com a fila Telegram antiga.
- TypeScript e build de produção aprovados; rotas novas compiladas, inclusive OCR com carregamento por clique.
- HTTP local: página inicial 200; geração, leitura/edição de consumo, resolução de link, upload, Telegram e agendamento retornam 401 sem autenticação.
- Allowlist administrativa cobre ausência, usuário não permitido e tentativa de correspondência parcial. RLS/grants negam acesso direto de `anon` e `authenticated` ao ledger, cache e RPC de reserva.
- Cenários simulados: três recuperações de cache evitaram chamadas e uma geração simultânea duplicada foi bloqueada. Três variações de dois produtos utilizaram uma única requisição simulada.
- Banco remoto: orçamento 4,50/0,50/100, geração paga desabilitada, bucket privado, zero chamadas no ledger novo e funções legadas preservadas. RPC com lista vazia verificada sem chamar provedor.
- Advisors do Supabase: nenhuma nova advertência WARN. INFO de RLS sem políticas é intencional para tabelas exclusivas do backend. Advertências antigas sobre duas funções SECURITY DEFINER de Telegram e proteção de senhas vazadas permanecem fora desta mudança: [funções privilegiadas](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable), [senhas](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection).
- Não houve envio real para Telegram/WhatsApp nem chamada paga OpenAI durante os testes simulados. Não houve QA visual: o ambiente não disponibilizou navegador, então layout e interação visual autenticada continuam pendentes de revisão humana.

## Único teste pago

Código publicado no GitHub (`f8d7d8e`) e na Vercel em 06/11/2026, com allowlist, modelo e flags de IA configurados. As chaves OpenAI e Supabase permanecem no backend da Vercel. O orçamento pago continua desativado e o novo ledger tem zero requisições. O administrador autorizou um único teste visual, detalhado em [leitura-visual.md](leitura-visual.md), que aguarda um print de produto; não realizar uma chamada textual adicional.

O crédito de US$ 5 e a configuração da chave na Vercel foram informados pelo administrador. Ele confirmou expressamente GTA 6 por R$ 418,41 no Pix e disponível; a conferência foi salva às 08:58:25 de 06/11/2026 em São Paulo, sem confirmar preço anterior ou parcelamento. Essa conferência vence após 15 minutos e deverá ser refeita antes de publicar uma oferta.

No teste visual, registrar modelo retornado, tokens, custo estimado e legenda; repetir o mesmo print para conferir recuperação do cache sem segunda chamada. Não enviar/publicar a oferta durante esse teste. Nenhuma conclusão sobre acesso da conta ao modelo pode ser inferida apenas da documentação ou da presença da chave.

Exemplo gratuito montado com os dados confirmados, sem consultar a OpenAI:

```text
🎮🔥 SUA PRÓXIMA PARTIDA COMEÇA AQUI! #publi

🛍️ *GTA 6 para PS5*

💙 *POR R$ 418,41 no Pix!*

🛒 CONFIRA NA LOJA E GARANTA O SEU 👇
https://meli.la/1oCLqHZ

💙 Dropou o preço? A gente te avisa!
```

Gratuitos quanto ao consumo OpenAI: OCR, recorte, validação, cálculos, templates, cache, edição, cópia, salvar, agendar, publicação Telegram e fluxo manual WhatsApp. Hospedagem, armazenamento e franquias dos serviços têm suas próprias condições.

Fontes oficiais verificadas em 06/11/2026: [GPT-6 Luna e tarifas](https://developers.openai.com/api/docs/models/gpt-6-luna), [Structured Outputs](https://developers.openai.com/api/docs/guides/structured-outputs), [cache e escrita cobrada](https://developers.openai.com/api/docs/guides/prompt-caching), [Tesseract.js](https://github.com/naptha/tesseract.js/blob/master/docs/api.md), [funções Supabase](https://supabase.com/docs/guides/database/functions).

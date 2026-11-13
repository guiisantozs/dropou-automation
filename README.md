# Dropou Automação

Integração Shopee e curadoria Tech & Games: [configuração, modo de teste e orçamento](docs/shopee-automation.md). A nova área **Automação de Ofertas** amplia a fila e o dispatcher existentes. A entrega começa desativada e em simulação; migração e credenciais exigem configuração no ambiente.

Refinamento gamer de 12/11: [busca de desempenho, score 40/25/20/15, filtros ajustáveis, variedade e histórico](docs/shopee-gamer-quality.md). Implementado somente para Dropou; outros grupos continuam desativados. Não libera postagens por conta própria.

Cadastro por link/print, OCR local e geração econômica de ofertas com cache, templates gratuitos e OpenAI opcional. WhatsApp manual e Telegram oficial. Next.js, TypeScript, Tailwind e Supabase Auth/Postgres/RLS. Dashboard renovado, catálogo em lista/cards e cadastro em três etapas. Automação continua pausada por padrão.

Configuração, funcionamento e evidências da nova implementação: [Dropou AI econômico](docs/ia-economica.md). Código publicado no GitHub e na Vercel em 06/11/2026.

Correções de OCR, editor persistente, miniaturas privadas e novo dashboard: [redesign e validação](docs/redesign-dashboard.md).

O cadastro também permite [Ctrl + V e leitura visual de prints](docs/leitura-visual.md), com dados e chamada criativa na mesma requisição, fallback OCR e armazenamento de recorte somente por autorização. O primeiro teste visual pago foi autorizado e aguarda um print de produto; o orçamento permanece desativado até o teste.

## Executar

Aplicação publicada: https://dropou-automation.vercel.app. Use sua conta existente do Supabase para entrar. O callback OAuth público é `https://dropou-automation.vercel.app/api/oauth/mercado-livre/callback`; a conexão Mercado Livre ainda exige as credenciais privadas descritas no guia abaixo.

OAuth Mercado Livre e publicação HTTPS: consulte [docs/mercado-livre-oauth.md](docs/mercado-livre-oauth.md). Credenciais permanecem exclusivamente no servidor. OAuth não garante permissão de busca de produtos.

Requer Node.js 20.9+ e npm. No Windows, use npm.cmd se o PowerShell bloquear npm.ps1.

```powershell
npm.cmd ci
Copy-Item .env.example .env.local
# Preencha a URL e a chave publicável do Supabase em .env.local.
npm.cmd run dev
```

Abra http://127.0.0.1:3000. Sem configuração a aplicação explica o que falta; não simula salvamentos nem preenche o dashboard com produtos fictícios.

## Banco e autenticação

O projeto do Dropou já está configurado em [Supabase](https://supabase.com/dashboard/project/wqpdyfipjsnyzxktacqh), organização `dropou-automation`. O schema foi aplicado remotamente e o primeiro GTA 6 foi salvo como rascunho histórico, sem publicação. Não reaplique o schema inicial nesse projeto. Nesta máquina, `.env.local` já está preenchido e permanece fora do Git. Em outro computador, obtenha a chave **publicável** no painel e preencha sua cópia local de `.env.local`.

1. Em um projeto Supabase novo, aplique `supabase/schema.sql` e depois `supabase/whatsapp-flow.sql`. Se o schema inicial já existir, aplique somente o segundo arquivo, que é idempotente. Não execute em outra aplicação sem conferir conflitos de tabelas.
2. Em Authentication → Users, crie seu usuário com email/senha, usando as opções do painel para confirmar o email conforme sua política. Faça login no aplicativo. Não compartilhe a senha no chat ou no repositório.
3. Configure `NEXT_PUBLIC_SUPABASE_URL` e `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` em `.env.local`. São configurações públicas: o acesso aos dados exige sessão e RLS. Reinicie/recompile após alterá-las.
4. O fluxo manual **não necessita de service role**, Telegram, cron ou credenciais de marketplace. Os endpoints verificam o usuário com `getUser(token)` e usam sua sessão, sujeita a RLS.

O navegador mantém apenas a sessão. Produtos, preços, legendas, status e publicações vêm do banco. O antigo localStorage da demonstração é ignorado. Exemplos fictícios estão apenas em `tests/fixtures`. Registros com `demo=true` não aparecem no workspace real.

## Fluxo de uma oferta

1. **Cadastrar produto**: nome, loja, categoria, links, imagem por URL, preços registrados e condição de pagamento. Se só tiver o link de afiliado, deixe o original vazio; não invente uma URL.
2. Estoque inicia como **não verificado**. O preço só é atual quando o administrador confirma que o conferiu agora na loja. Pix, referência anterior e parcelamento têm confirmações próprias. Uma edição exige nova conferência; sem ela os valores são históricos.
3. **Salvar produto** grava cadastro e registro de preço em uma transação. A tela recarrega o que foi persistido.
4. **Gerar legenda**: sem revalidação, gera rascunho com aviso histórico, sem anunciar desconto/Pix/parcelamento como atuais. Com revalidação, usa o formato pedido, calcula a economia em centavos e omite condições não comprovadas.
5. **Salvar oferta** persiste legenda e cópia dos dados usados. Alterar o produto invalida a oferta. **Copiar legenda completa** e **Copiar link de afiliado** usam a Clipboard API e informam erros de permissão. Use localhost ou HTTPS.
6. Publique você mesmo no WhatsApp. Marque **Publiquei manualmente…** e **Marcar como publicada**. O banco verifica link, estoque, validade de 15 minutos, Pix e correspondência dos dados. Histórico e estados são gravados em uma transação. Repetir não duplica a publicação.
7. **Excluir oferta** pede confirmação e remove a oferta da fila por exclusão lógica. Produto, preços e histórico de publicação permanecem. Métricas de publicação vêm do histórico; excluir a oferta não apaga esse fato.

Não há envio ao WhatsApp nem comprovação externa da postagem. O histórico registra a declaração do administrador. RLS separa dados por usuário; o proprietário administra seus registros, que não são prova forense imutável.

## GTA 6 para PS5

O formulário permite **Preencher caso GTA 6 (valores históricos)** com os dados do administrador: link `https://meli.la/1oCLqHZ`, preço anterior R$ 449,90, preço Pix registrado R$ 418,41 e condição registrada 8x de R$ 56,24.

Não afirma estoque, imagem, URL original ou preço atual. Sem conferência, a legenda é rascunho e a publicação fica bloqueada. A diferença matemática é R$ 31,49; só pode ser anunciada após comprovar os preços. Os testes simulam revalidação em banco isolado e não confirmam o anúncio real.

## CSV

Até 1.000 linhas/2 MB. UTF-8 e cabeçalho de `public/exemplo-produtos.csv`; decimais com ponto, booleanos true/false, sim/nao ou 1/0. O parser detecta vírgula/ponto e vírgula. Linhas válidas vão para o banco e falhas são informadas. CSV não confirma preço atual nem presume estoque ausente.

Duplicatas usam domínio/caminho do link original ou, se ausente, do afiliado. Links encurtados diferentes para o mesmo produto ainda exigem revisão; a integração futura usará o ID oficial da loja.

## Integrações

**Obter dados** consulta somente fontes autorizadas no servidor. Após HTTP 403, a consulta individual do Mercado Livre também exige `MERCADO_LIVRE_LOOKUP_APPROVED=true`; A busca Shopee com cache e limite diário fica em Automação de Ofertas; a consulta individual do fluxo legado continua manual. Na falta dos dados, use um print com OCR local ou cadastro manual. Não há scraping nem coleta pelo link encurtado.

Busca em `/buscar-ofertas`, com filtros, importação revalidada e preparação em lote. Mercado Livre consulta os endpoints documentados apenas com token OAuth e autorização configurados no servidor; a plataforma ainda pode negar a busca. A busca Shopee de Tech & Games fica em Automação de Ofertas, com orçamento compartilhado. A tentativa real de cinco produtos retornou HTTP 403, sem resultados: a descoberta ponta a ponta ainda depende de credenciais/permissões. Veja [relatório de busca real e configuração exata](docs/busca-real-validacao.md). Nenhum token é necessário para continuar usando o cadastro manual.

## Testar e implantar

```powershell
npm.cmd test
npm.cmd run typecheck
npm.cmd run build
npm.cmd start
```

Os testes executam as mesmas funções SQL em PostgreSQL embarcado/PGlite, com dois usuários e RLS. Cobrem cadastro GTA, preço histórico, legenda, contrato de cópia, revalidação sintética, publicação, métricas, repetição e exclusão. O Clipboard usa um objeto de teste: não equivale a clicar e colar no Windows. Validação em Supabase remoto e navegador deve constar separadamente em `VALIDACAO.md`.

Hospede em um provedor Next.js/Node, configurando as duas variáveis públicas antes do build. O banco fica no Supabase, independente do computador. Não envie `.env.local` ao GitHub.

Cadastro completo em `/ofertas/nova`, edição em `/ofertas/[produto]/editar` e publicação em `/ofertas/[produto]`. Telegram confirma o canal antes do envio; WhatsApp usa compartilhamento manual e registra o destino apenas depois da confirmação do administrador. Veja o [relatório de publicação, agendamento e performance](docs/publicacoes-agendamento-performance.md).

A fila existente `telegram_jobs` usa um único pg_cron, `dropou-telegram-dispatch`, a cada minuto, chamando `POST /api/telegram/dispatch`. Não adicione um segundo cron na Vercel. A pausa fica em `telegram_dispatch_config.automation_enabled`, controlada em **Agendamento**, inicialmente desativada. O antigo `ENABLE_AUTOMATIONS` não controla essa fila. O segredo do dispatcher permanece no banco e no backend. Cada execução processa no máximo uma oferta; atrasos são possíveis. Sem conferência humana válida por até 15 minutos, Telegram fica aguardando conferência. WhatsApp fica apenas pronto para compartilhar. Nenhuma publicação real é executada pelos testes.

Migração incremental aplicada ao projeto existente: `supabase/migrations/20261106150839_publication_dispatch_and_review.sql`. Em instalações novas, aplique as migrações anteriores de IA, Telegram e editor antes desta. Telegram aceita `TELEGRAM_CHAT_ID` ou `TELEGRAM_CHANNEL_ID`; se ambos existirem, precisam ser iguais. O backend de fila e conferência usa `SUPABASE_SECRET_KEY` e o administrador já autorizado em `telegram_dispatch_config.owner_ids`. Nunca exponha esses segredos com `NEXT_PUBLIC_`.

Referência: [Supabase — grants e RLS](https://supabase.com/docs/guides/api/securing-your-api).

Fluxo atual do painel: [Próximos posts e redesign](docs/premium-dashboard.md), [curadoria gamer](docs/shopee-gamer-quality.md) e [legendas Tech & Games com agendamento rápido](docs/legendas-tech-games.md).

**Meus links Shopee**: cole links comuns para salvar os produtos e buscar foto, nome, preço e link de afiliado pela API, sem print. [Guia dos produtos salvos](docs/shopee-links-salvos.md).

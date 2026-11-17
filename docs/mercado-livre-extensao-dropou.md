# Extensão Mercado Livre → Dropou

Primeira ponte explícita, branch `codex/mercado-livre-extension-bridge`, baseada na main `c9ae248`. Sem merge, push, deploy ou migração remota nesta entrega. O código da aplicação e a migração precisam ser instalados em uma publicação posterior antes de a extensão se conectar à produção atual.

## Instalação e primeiro produto

1. Na futura instalação da aplicação, revisar e aplicar somente `supabase/migrations/20261117115743_mercado_livre_extension_inbox.sql` ao projeto Dropou e publicar esta versão. Não reaplicar o schema inicial ou migrations antigas. Não há novas variáveis ou dependências de produção.
2. Em `chrome://extensions`, habilitar o modo desenvolvedor. Recarregar a extensão já instalada, ou carregar sem compactação a pasta `experiments/mercado-livre-extension/`. A versão do manifest é **0.5.0**. Atualizar também a aba do Dropou após recarregar a extensão.
3. Manter o Chrome aberto e entrar normalmente no Mercado Livre. Abrir `https://dropou-automation.vercel.app`, entrar no Dropou e selecionar uma operação autorizada com Mercado Livre: Tech & Games, Bruto, Moda, Celulares, Tênis ou Auto & Moto. O consolidado exige selecionar uma operação; Beleza/Casa/Natal conservam a integração Shopee existente.
4. No painel lateral da extensão, clicar **Ativar** e **Conectar ao Dropou**. Conferir a operação exibida. A conexão da aba dura cinco minutos e é invalidada ao recarregar, trocar de conta ou operação. Reconectar quando necessário. Se a aba não existir, a extensão abre a origem oficial; entrar e conectar novamente.
5. Adicionar o anúncio normal usando **Adicionar produto da aba atual**, ou informar de um a cinco links. Iniciar a conversão existente. Login, CAPTCHA, bloqueios ou erros pedem intervenção normal do usuário; não são contornados.
6. Depois que o lote terminar, clicar **Enviar ao Dropou** individualmente em cada candidato `meli.la`. Nenhum resultado é enviado automaticamente. A extensão só exibe **Enviado · Aguardando conferência** depois de a API confirmar a solicitação persistida. Cadastro reconhecido exibe **Já cadastrado**. Falha permanece **Erro**, permitindo reenviar o mesmo identificador após reconexão.
7. Na aba Dropou, abrir a seção **Extensão Mercado Livre**. Ela abre ao receber um resultado. **Produtos recebidos** recupera as últimas vinte pendências após reload/desconexão; receber não cria produto, oferta, agendamento ou entrega.
8. Abrir os dois links e conferir anúncio, vendedor, variante, preço, foto, disponibilidade e link gerado na própria conta. Completar apenas nome/preço/foto/variante ausentes. Se a variante ainda não estiver escolhida, o preço geral não é usado como preço dessa variante. Confirmar e clicar **Conferir e abrir oferta**.
9. O modal premium **Publicar oferta** existente oferece **Salvar**, **Agendar** e **Publicar agora**, com as validações, destinos e recibos já existentes. Não há desvio automático para o formulário de três etapas. A revisão não envia mensagens. Abrir o modal não agenda nem publica.

O conversor continua funcionando sem conexão com o Dropou. Desligá-lo impede novos envios e limpa sua conexão/fila temporária, sem apagar solicitações já confirmadas no servidor. Uma solicitação já recebida pode concluir após o desligamento; seu identificador permite recuperar o resultado com segurança. O Chrome precisa permanecer aberto durante a conversão.

## Dados e conferência

- **Automáticos, quando disponíveis na API autorizada:** identificação do anúncio/catálogo, nome, imagem, preço, situação de estoque e metadados já suportados pelo importador. O cache/cooldown existente continua sendo usado. Sem scraping de anúncios, endpoint oculto ou novo conversor.
- **Ausentes:** o formulário pede os fatos não obtidos. Falha/403 da API não vira preço zero publicável nem estoque confirmado. Não são inventadas avaliações ou fotos. Foto privada já existente é reutilizada.
- **Sempre humanos:** correspondência anúncio/vendedor/variante/link, atualidade das condições e origem do link na conta afiliada. Redirecionamento identificável para outro anúncio é recusado no servidor. Redirecionamento bloqueado permanece sem correspondência automática e exige conferência explícita.
- **Comissão:** o link fica `informed`, nunca `verified` por causa da extensão. Identificar o destino não comprova atribuição, etiqueta ou comissão.
- **Duplicados:** mesma solicitação reutiliza o recibo; revisão repetida ou nova solicitação para a mesma identidade reutiliza o produto por proprietário/operação. Cadastros antigos mantêm seus dados, edições e histórico. Link já salvo é preservado; se o campo estiver vazio, a conferência explícita preenche somente esse link com o candidato recebido e invalida a prontidão de rascunhos antigos. Arquivados não são restaurados. Sem recibo de envio fictício.

## Contratos e segurança

O worker usa `chrome.tabs.sendMessage` com `frameId: 0` para um content script declarado exclusivamente em `https://dropou-automation.vercel.app/*`. Não aceita localhost, previews Vercel ou domínios parecidos. O content script roda no mundo isolado e só repassa mensagens correlacionadas entre a extensão e a janela superior da origem exata. Não há `externally_connectable` ou permissões de cookies. Comandos do painel são recusados quando partem de uma aba de conteúdo Mercado Livre.

O protocolo `dropou-ml-v1` transporta somente request UUID, URLs original/candidata, itemId quando identificável e `review: candidate`. A conexão contém um nonce da página com cinco minutos, operação e tabId; não é credencial de login e não autoriza chamadas HTTP por si só. Trocar a operação invalida o nonce. Reenvio de um resultado fica vinculado à operação original para evitar importar acidentalmente em outra marca.

A página usa o `apiForOperation` existente. O token de sessão permanece exclusivamente entre a aplicação e seu backend. A extensão não recebe tokens Supabase, cookies Mercado Livre, senhas ou credenciais do servidor. O content script filtra os campos das respostas. Mensagens de outro site, frame, extensão ou correlação são ignoradas.

`GET/POST /api/mercado-livre/extension` usa `sessionDb`, autorização atual por marca e RLS. POST exige Origin igual à aplicação e valida corpo/identidades. Toda escrita privilegiada também passa por `publicationAdmin`. Não há CORS aberto. A tabela `ml_extension_inbox` mantém a solicitação e o rascunho, com leitura autenticada no escopo permitido e escrita somente servidor. A RPC `dropou_ml_extension_prepare` é invoker, `search_path` vazio, somente service_role, revalida associação, bloqueia solicitação/identidade transacionalmente e preserva produto existente. Nenhuma configuração, rotina ou transporte de publicação foi alterado.

As chamadas oficiais são as do importador e do resolvedor de links existentes. O gerador da extensão continua usando a interface oficial do Mercado Livre no navegador do usuário. Documentação primária consultada: [content scripts](https://developer.chrome.com/docs/extensions/develop/concepts/content-scripts), [mensagens Chrome](https://developer.chrome.com/docs/extensions/develop/concepts/messaging) e [getUser Supabase](https://supabase.com/docs/reference/javascript/auth-getuser).

## Validação local

`npm.cmd test`, `npm.cmd test --prefix experiments/mercado-livre-extension`, `npm.cmd run typecheck` e `npm.cmd run build`. Resultados efetivamente executados em `VALIDACAO.md`. Testes específicos cobrem individual/cinco links, envio explícito, recibo, erro/reconexão, origem/frame/sender, desligamento, sessão/permissão, duplicação, link incompatível, falha de dados, variantes e isolamento. SQL testado em PGlite com cadeia histórica completa e defaults de grants do fixture existente.

Roteiro `scripts/review-ml-extension.ts`: Next real no Chrome com conta, respostas de API e runtime da extensão fictícios; tráfego remoto bloqueado. Não representa instalação real da extensão Chrome, conversão logada no Mercado Livre, autenticação de produção ou entrega Telegram. Evidências locais em `outputs/ml-extension-*` são ignoradas pelo Git. Não repetir consultas reais, migrações remotas, mensagens ou ativação de rotinas para validar esta branch.


## Arquivos desta entrega

- [AGENTS.md](../AGENTS.md)
- [docs/mercado-livre-extensao-dropou.md](../docs/mercado-livre-extensao-dropou.md)
- [experiments/mercado-livre-extension/dropou.mjs](../experiments/mercado-livre-extension/dropou.mjs)
- [experiments/mercado-livre-extension/dropou.test.mjs](../experiments/mercado-livre-extension/dropou.test.mjs)
- [experiments/mercado-livre-extension/dropou-bridge.js](../experiments/mercado-livre-extension/dropou-bridge.js)
- [experiments/mercado-livre-extension/INTEGRACAO-FUTURA.md](../experiments/mercado-livre-extension/INTEGRACAO-FUTURA.md)
- [experiments/mercado-livre-extension/manifest.json](../experiments/mercado-livre-extension/manifest.json)
- [experiments/mercado-livre-extension/package.json](../experiments/mercado-livre-extension/package.json)
- [experiments/mercado-livre-extension/popup.html](../experiments/mercado-livre-extension/popup.html)
- [experiments/mercado-livre-extension/popup.js](../experiments/mercado-livre-extension/popup.js)
- [experiments/mercado-livre-extension/README.md](../experiments/mercado-livre-extension/README.md)
- [experiments/mercado-livre-extension/worker.js](../experiments/mercado-livre-extension/worker.js)
- [experiments/mercado-livre-extension/worker.test.mjs](../experiments/mercado-livre-extension/worker.test.mjs)
- [scripts/fixtures/ml-extension-http.ts](../scripts/fixtures/ml-extension-http.ts)
- [scripts/review-ml-extension.ts](../scripts/review-ml-extension.ts)
- [src/app/api/mercado-livre/extension/route.ts](../src/app/api/mercado-livre/extension/route.ts)
- [src/app/layout.tsx](../src/app/layout.tsx)
- [src/components/dashboard.tsx](../src/components/dashboard.tsx)
- [src/components/mercado-livre-extension.css](../src/components/mercado-livre-extension.css)
- [src/components/mercado-livre-extension.tsx](../src/components/mercado-livre-extension.tsx)
- [src/lib/mercado-livre-extension.ts](../src/lib/mercado-livre-extension.ts)
- [src/lib/mercado-livre-extension-bridge.ts](../src/lib/mercado-livre-extension-bridge.ts)
- [src/server/mercado-livre/extension.ts](../src/server/mercado-livre/extension.ts)
- [src/server/mercado-livre/extension-core.ts](../src/server/mercado-livre/extension-core.ts)
- [src/server/mercado-livre/import.ts](../src/server/mercado-livre/import.ts)
- [supabase/migrations/20261117115743_mercado_livre_extension_inbox.sql](../supabase/migrations/20261117115743_mercado_livre_extension_inbox.sql)
- [tests/fixtures/ml-extension.ts](../tests/fixtures/ml-extension.ts)
- [tests/mercado-livre-extension.test.ts](../tests/mercado-livre-extension.test.ts)
- [tests/mercado-livre-extension-db.test.ts](../tests/mercado-livre-extension-db.test.ts)
- [tests/mercado-livre-extension-ui.test.ts](../tests/mercado-livre-extension-ui.test.ts)
- [VALIDACAO.md](../VALIDACAO.md)

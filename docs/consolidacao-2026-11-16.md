# Consolidação Dropou — 16/11/2026

## Origem e preservação

- Repositório confirmado: `guiisantozs/dropou-automation`, workspace `dropou-automation-main`.
- Branch original: `codex/celulares-intelligent-curation`, HEAD `ec04a14`. Nenhum commit local exclusivo em relação às referências remotas. Havia 93 arquivos modificados/novos, incluindo código MTProto e curadoria de celulares.
- Backup original: `backup/dropou-local-2026-11-16`. Backup do trabalho commitado: `backup/dropou-local-work-2026-11-16`, commit `9ba5093`. Cópia independente dos arquivos e hashes em `outputs/integration-backup-2026-11-16/`, ignorada pelo Git.
- Integração feita exclusivamente em `integration/dropou-consolidacao-2026-11-16`. Sem reset destrutivo, clean, force push, descarte de código ou alteração do ambiente local.
- Código do worker em `src/server/mtproto/`, contratos MTProto, rota de conexões e `.env.example` permanecem iguais ao backup local commitado. Sessões e `.env.local` não foram adicionados ao Git.

## Ancestralidade e integração

Após `git fetch --all --prune`, `origin/main` estava sete commits à frente da base local, até `08f9044` (estrutura premium, bibliotecas e modal rápido). Incorporada por merge, preservando os dois lados.

| Branch remota | Decisão |
| --- | --- |
| `main` | Incorporados os sete commits novos. |
| `codex/operation-dashboard-structure` | Já ancestral da main; nenhum merge duplicado. |
| `codex/karen-dashboards` | Incorporada por ancestralidade do catálogo premium. |
| `codex/catalog-premium` | Merge completo, incluindo Karen e novas marcas. |
| `feat/mercado-livre-browser-poc` | Merge completo dos experimentos isolados, extensão, painel lateral e conversão em lote. |

A ancestralidade das quatro branches citadas foi conferida na integração. Nenhum histórico remoto foi reescrito. A extensão continua instalada/executada no Chrome local; não se transforma em serviço da Vercel.

## Conflitos e comportamento preservado

Conflitos em `VALIDACAO.md`, `dashboard.tsx`, `product-operations.tsx`, `api/product-operations/route.ts` e `domain.ts` foram combinados. Documentação dos dois lados foi mantida. Navegação premium/modal rápido e catálogo coexistem com conexões MTProto, fila persistente e filtros/evidências de celulares. `seminovo` e as novas marcas de legenda são aceitos juntos.

O menu premium tinha uma lista fixa de destinos e ocultava os atalhos MTProto; foram adicionados aos grupos adequados, com regressão de renderização. As novas marcas locais recusam também as rotas de conexões e espelhamento, além das integrações que já recusavam. Permissões continuam sendo verificadas no servidor por `sessionDb`, com escrita privilegiada via `publicationAdmin`.

Preservados: paletas por operação, dashboard geral claro, catálogo/curadoria/salvos, modal de publicação, agendamento, recibos reais, bloqueios de entrega incerta, WhatsApp manual, integração Shopee e experimentos Mercado Livre. Nenhuma publicação, consulta de produto, geração paga ou ativação foi usada como teste.

## Supabase: somente três incrementais

Projeto `wqpdyfipjsnyzxktacqh`. Histórico remoto conferido antes de escrever: celulares compartilhados e conexões MTProto já estavam aplicados e não foram reaplicados. Somente estas três versões faltavam e foram aplicadas individualmente, com timeout, transação, trava, recusa de reaplicação e registro do SQL canônico no histórico:

| Versão | Nome |
| --- | --- |
| `20261116025405` | `mtproto_persistent_mirror_queue` |
| `20261116192906` | `karen_dashboards_membership` |
| `20261116202017` | `catalog_visual_retention` |

A fila usa a correção local já existente dos grants `service_role`, sem editar uma migração previamente aplicada. PGlite validou a cadeia combinada, padrões de privilégios Supabase, transações e recusa de reaplicação. O hash remoto das funções de orçamento foi conferido antes da substituição prevista pela migração.

Postcheck remoto agregado: quatro tabelas de espelhamento com RLS e matriz exata do servidor, anônimo sem acesso e integrantes sem escrita; RPCs invoker disponíveis apenas ao servidor; view do catálogo invoker. Três novas marcas criadas pausadas e sem destinos. Nenhum integrante foi associado: o cadastro real de Karen continua dependendo de identificar a conta correta.

A impressão digital agregada da conexão/sessão MTProto foi idêntica antes/depois; uma conexão existente preservada. Entregas permaneceram 43 durante a janela de aplicação; fila/eventos de espelhamento vazios. O único cron `dropou-telegram-dispatch` e flags das operações existentes foram preservados. Não restaurar snapshots antigos caso o usuário opere depois da conferência.

Advisors: antes 18 INFO/1 WARN, depois 19 INFO/1 WARN. Novo INFO esperado de RLS sem política na tabela interna `mirror_budget_limits`, sem acesso de clientes e somente SELECT do servidor. Aviso anterior de proteção de senhas vazadas permanece. Referência: https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy.

## Validação e limites

- `npm.cmd test`: **442/442**, nenhuma falha ou teste desativado.
- Extensão Mercado Livre: **18/18**; experimento de navegador: **5/5**. Nenhum navegador autenticado do Mercado Livre foi usado.
- `npm.cmd run typecheck` e `npm.cmd run build`: aprovados. `git diff --check` aprovado.
- A primeira tentativa de teste foi impedida pelo sandbox do Windows (`uv_os_get_passwd`); execução autorizada fora dessa restrição passou. Um teste novo teve fixture com loja padrão divergente do link; corrigido o fixture e repetida a suíte completa.
- `outputs` foi excluído do TypeScript para que a cópia de segurança de fontes não seja compilada como uma segunda aplicação incompleta. Fontes e testes reais continuam incluídos.
- Chrome/Next compilado com Auth/APIs sintéticos e rede externa bloqueada: catálogo em dez escopos × quatro larguras; dashboards de Karen, seleção, geral, Tech, Celulares e telas MTProto. Evidências e resultados em `outputs/integration-*-review/`. Capturas de desktop/celular inspecionadas. Os roteiros antigos foram adaptados aos caminhos locais e ao catálogo combinado; nenhuma fixture foi implantada.
- Auditoria dos arquivos versionáveis: sem correspondências de valores privados locais, padrões de credenciais ou arquivos de sessão. `.gitignore` reforçado para sessões/chaves/cookies. Não registrar valores privados em futuras auditorias.

## Entrega e dependências reais

Projeto Vercel confirmado: `dropou-automation`, ID `prj_SjwOCikSZCqDbBZmjZLXA0hGi8O0`, repositório correto e produção `main`. Produção anterior em `08f9044`. Usar push normal da branch de integração e avanço seguro da main; acompanhar o deploy automático, sem deploy de produção duplicado. O SHA e o resultado efetivo serão registrados no relatório de entrega da sessão.

Nomes das variáveis de produção conferidos sem baixar segredos. Integrações existentes têm configuração cadastrada. URL/segredo do worker MTProto não estão na Vercel: código/painel preservados, mas conexão operacional exige um worker separado acessível por HTTPS e o mesmo segredo, sem substituir a chave de sessão existente. Worker não iniciado nem autenticado nesta consolidação. A extensão Chrome continua independente.

Permanecem fora da comprovação: login real de Karen após associação, navegação autenticada real em produção, sessão operacional do worker remoto, recebimento persistente real e conversão no navegador Mercado Livre autenticado. Testes com fixtures/PGlite não comprovam esses serviços reais. Não enviar mensagens ou iniciar espelhamento apenas para verificar deploy.

## Arquivos da integração em relação à main auditada

- `.dockerignore`
- `.env.example`
- `.gitignore`
- `AGENTS.md`
- `deploy/telegram-mtproto.Dockerfile`
- `docs/catalogo-premium.md`
- `docs/consolidacao-2026-11-16.md`
- `docs/multiusuarios-karen.md`
- `docs/telegram-mirror-migration-review.md`
- `docs/telegram-mirror-postcheck.sql`
- `docs/telegram-mirror-preflight.sql`
- `docs/telegram-mirror-queue.md`
- `docs/telegram-mtproto.md`
- `docs/telegram-mtproto-affiliate.md`
- `docs/telegram-mtproto-migration-review.md`
- `docs/telegram-mtproto-postcheck.sql`
- `docs/telegram-mtproto-preflight.sql`
- `docs/telegram-mtproto-shopee.md`
- `experiments/mercado-livre-browser/.gitignore`
- `experiments/mercado-livre-browser/links.mjs`
- `experiments/mercado-livre-browser/links.test.mjs`
- `experiments/mercado-livre-browser/manual.mjs`
- `experiments/mercado-livre-browser/package.json`
- `experiments/mercado-livre-browser/poc.mjs`
- `experiments/mercado-livre-browser/README.md`
- `experiments/mercado-livre-extension/batch.mjs`
- `experiments/mercado-livre-extension/batch.test.mjs`
- `experiments/mercado-livre-extension/core.mjs`
- `experiments/mercado-livre-extension/core.test.mjs`
- `experiments/mercado-livre-extension/INTEGRACAO-FUTURA.md`
- `experiments/mercado-livre-extension/manifest.json`
- `experiments/mercado-livre-extension/package.json`
- `experiments/mercado-livre-extension/page.js`
- `experiments/mercado-livre-extension/popup.html`
- `experiments/mercado-livre-extension/popup.js`
- `experiments/mercado-livre-extension/README.md`
- `experiments/mercado-livre-extension/worker.js`
- `experiments/mercado-livre-extension/worker.test.mjs`
- `next-env.d.ts`
- `package.json`
- `package-lock.json`
- `scripts/check-catalog.ts`
- `scripts/check-member-dashboards.ts`
- `scripts/check-telegram-mtproto-worker.ts`
- `scripts/fixtures/member-auth-fixture.mjs`
- `scripts/plan-catalog-cleanup.ts`
- `scripts/prepare-telegram-mtproto-migration.mjs`
- `scripts/review-mirrored-offers.ts`
- `scripts/review-telegram-connections.ts`
- `scripts/telegram-mtproto-worker.ts`
- `src/app/api/catalog/[id]/history/route.ts`
- `src/app/api/catalog/route.ts`
- `src/app/api/mirrored-offers/route.ts`
- `src/app/api/offers/[id]/channels/route.ts`
- `src/app/api/operations/route.ts`
- `src/app/api/product-operations/route.ts`
- `src/app/api/publication-config/route.ts`
- `src/app/api/shopee/automation/route.ts`
- `src/app/api/shopee/curation-config/route.ts`
- `src/app/api/team/route.ts`
- `src/app/api/telegram/connections/route.ts`
- `src/app/catalog.css`
- `src/app/layout.tsx`
- `src/app/member-workspaces.css`
- `src/app/refined-workspace.css`
- `src/components/brand-selector.tsx`
- `src/components/catalog-parts.tsx`
- `src/components/catalog-repost-context.tsx`
- `src/components/catalog-workspace.tsx`
- `src/components/celulares-curation-settings.tsx`
- `src/components/dashboard.tsx`
- `src/components/dashboard-chooser.tsx`
- `src/components/mirrored-offers.module.css`
- `src/components/mirrored-offers.tsx`
- `src/components/product-form.tsx`
- `src/components/product-operations.tsx`
- `src/components/publication-actions.tsx`
- `src/components/quick-offer-context.tsx`
- `src/components/quick-offer-extras.tsx`
- `src/components/quick-offer-modal.tsx`
- `src/components/team-settings.tsx`
- `src/components/telegram-connections.module.css`
- `src/components/telegram-connections.tsx`
- `src/components/telegram-shopee-test-queue.tsx`
- `src/components/whatsapp-channel-publication.tsx`
- `src/components/workspace-sidebar.tsx`
- `src/lib/ai.ts`
- `src/lib/catalog.ts`
- `src/lib/celulares-curation.ts`
- `src/lib/celulares-quality.ts`
- `src/lib/celulares-view.ts`
- `src/lib/channel-profiles.ts`
- `src/lib/dashboard-access.ts`
- `src/lib/domain.ts`
- `src/lib/mirrored-offers.ts`
- `src/lib/operator-access.ts`
- `src/lib/shopee-automation.ts`
- `src/lib/shopee-curation.ts`
- `src/lib/shopee-freshness.ts`
- `src/lib/shopee-limits.ts`
- `src/lib/shopee-product.ts`
- `src/lib/shopee-quality.ts`
- `src/lib/telegram-mtproto.ts`
- `src/lib/telegram-mtproto-shopee.ts`
- `src/lib/workspace-brands.ts`
- `src/server/general-dashboard.ts`
- `src/server/local-products.ts`
- `src/server/mtproto/adapter.ts`
- `src/server/mtproto/config.ts`
- `src/server/mtproto/http.ts`
- `src/server/mtproto/input.ts`
- `src/server/mtproto/persistent-offers.ts`
- `src/server/mtproto/proxy.ts`
- `src/server/mtproto/security.ts`
- `src/server/mtproto/service.ts`
- `src/server/mtproto/shopee-affiliate.ts`
- `src/server/mtproto/shopee-catalog.ts`
- `src/server/mtproto/shopee-links.ts`
- `src/server/mtproto/shopee-queue.ts`
- `src/server/mtproto/shopee-resolver.ts`
- `src/server/mtproto/store.ts`
- `src/server/session.ts`
- `src/server/shopee/budget.ts`
- `src/server/shopee/client.ts`
- `src/server/shopee/curation.ts`
- `src/server/shopee/manual-actions.ts`
- `src/server/shopee/on-demand.ts`
- `src/server/shopee/product-offers.ts`
- `src/server/shopee/saved-products.ts`
- `supabase/migrations/20261115183010_celulares_curation_shared_products.sql`
- `supabase/migrations/20261115234052_telegram_mtproto_connections.sql`
- `supabase/migrations/20261116025405_mtproto_persistent_mirror_queue.sql`
- `supabase/migrations/20261116192906_karen_dashboards_membership.sql`
- `supabase/migrations/20261116202017_catalog_visual_retention.sql`
- `tests/catalog.test.ts`
- `tests/celulares-curation.test.ts`
- `tests/celulares-migration.test.ts`
- `tests/celulares-search.test.ts`
- `tests/celulares-shared-db.test.ts`
- `tests/celulares-ui.test.ts`
- `tests/channel-expansion.test.ts`
- `tests/consolidation.test.ts`
- `tests/fixtures/supabase-default-acls.sql`
- `tests/member-dashboards.test.ts`
- `tests/mirrored-offers-db.test.ts`
- `tests/on-demand.test.ts`
- `tests/operation-dashboard.test.ts`
- `tests/redesign-ui.test.ts`
- `tests/saved-retention.test.ts`
- `tests/scheduling-workspace-db.test.ts`
- `tests/telegram-mtproto.test.ts`
- `tests/telegram-mtproto-affiliate.test.ts`
- `tests/telegram-mtproto-db.test.ts`
- `tests/telegram-mtproto-migration-review.test.ts`
- `tests/telegram-mtproto-shopee.test.ts`
- `tests/telegram-mtproto-shopee-ui.test.ts`
- `tests/telegram-mtproto-worker.test.ts`
- `tsconfig.json`
- `VALIDACAO.md`
- `vercel.json`

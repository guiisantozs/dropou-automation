# Dashboards premium por operação

A composição de Todas as Operações agora é a mesma nas seis operações: visão geral, atividade semanal, distribuição, agenda, próximos produtos, atividade recente, ofertas prontas e resumo dos canais. O consolidado continua claro, em preto e branco. Não existe uma cópia de JSX por marca.

## Componentes e arquivos

| Arquivo | Responsabilidade |
| --- | --- |
| `src/components/general-dashboard.tsx` | `GeneralDashboard` recebe `operation`; `GeneralDashboardView`, `PanelHeading` e `GeneralProductCard` compõem os mesmos painéis e ações em todos os escopos. Paginação por conta/operação, atualização e recuperação de erros reutilizadas. |
| `src/components/dashboard.tsx` | Monta o componente compartilhado em cada dashboard. Reutiliza `WorkspaceSidebar` e `WorkspacePageHeader`; catálogo, busca e demais ferramentas continuam acessíveis. A biblioteca Tech também passa a herdar o tema ativo. |
| `src/app/operation-dashboard.css` | Adaptação de cores por tokens herdados, sem seletor de marca ou tabela de paletas. Reutiliza as grades, tipografia, proporções, breakpoints e espaçamentos do dashboard geral. |
| `src/app/operation-theme.css` | Acrescenta somente a paleta Tech & Games fornecida posteriormente pelo usuário. O bloco original de Celulares permanece intacto. |
| `src/app/layout.tsx` | Carrega a adaptação de tema após os estilos compartilhados. |
| `src/lib/general-dashboard.ts` | Contrato compartilhado; resumo opcional conserva os indicadores operacionais de hoje/ontem e catálogo. |
| `src/server/general-dashboard.ts` | Reutiliza o resumo completo de leitura no escopo ativo. Tabelas filtradas explicitamente por proprietário e marca; RPCs recebem o mesmo cliente RLS de `sessionDb`. Curadoria lê apenas o cache da operação selecionada. |
| `src/app/api/dashboard/operation/route.ts` | Novo GET autenticado de apresentação; reutiliza `sessionDb` sem alterar sua implementação. Não aceita o escopo `all`. |
| `scripts/review-operation-dashboard.tsx` | Prévia estática com componentes reais e fixtures, incluindo estados vazios. |
| `scripts/check-operation-dashboard-{data,live}.ts`, `tests/operation-dashboard.test.ts` | Verificação do resumo e da interface compartilhada. |
| `scripts/check-operational-workspace.ts` | Roteiro existente atualizado para a composição e paleta autorizadas. |

## Temas

Os componentes consomem `--canvas`, `--surface`, `--subtle`, `--ink`, `--ink-muted`, `--border`, `--primary`, `--primary-ink`, `--focus` e `--chart-*`. Os gráficos SVG também usam variáveis CSS. Nenhum componente escolhe uma cor com base no ID da operação. Os estilos e a paleta clara do geral não foram alterados.

A instrução posterior do usuário autoriza uma exceção apenas para Tech & Games:

- Gaming Black `#0A0E27`: base predominante e sidebar.
- Daisy Bush `#5B36A6`: painel principal e identidade secundária.
- Cyber Cyan `#00F0FF`: ações, foco e destaques, com texto escuro nos botões para contraste.

Superfícies, bordas e texto usam tons de apoio do tema. A imagem foi usada como referência de paleta; suas fontes não foram acrescentadas. As demais operações conservam os tokens existentes. Celulares continua com `--primary:#00E5DD`, `--canvas:#080E11` e `--surface:#101B20`; as outras continuam herdando a configuração anterior. Nenhum tema foi inferido pelo campo histórico `tone` de `workspace-brands.ts`.

## Dados e limites

Os indicadores operacionais Shopee de curadoria, aprovados inéditos, publicados hoje/ontem e catálogo permanecem no painel superior. A agenda e o resumo dos canais exibem os destinos agendados. Contagens completas usam paginação interna limitada e recusam leituras truncadas. Distribuição conta cada produto cadastrado uma vez; curadoria sem cadastro fica fora do denominador, como no consolidado. O gráfico exige evidência confirmada, no fuso Bahia. Copiar uma legenda não cria uma publicação.

O novo GET não executa manutenção, consulta externa de produtos, geração de conteúdo ou escrita. Não há migration, alteração de schema/RLS, integração, autenticação, dispatcher ou fluxo de publicação. Telegram/agendamento abrem os fluxos existentes e a cópia para WhatsApp relê a oferta autenticada. A biblioteca conserva as mesmas APIs e controles.

## Visualização e entrega

Prévia local demonstrativa: `http://127.0.0.1:4196/?brand=dropou`, `?brand=celulares` ou `?brand=all`. Os botões da prévia estática não executam ações. As verificações funcionais são realizadas no Next local com sessão e APIs fictícias, HTTP externo bloqueado e Realtime simulado.

Implementação isolada na branch `codex/operation-dashboard-structure`, baseada em `693f63e`, no worktree `outputs/operation-dashboard-worktree`. A main, a branch experimental Mercado Livre e o lockfile local foram preservados. Sem merge, push ou deploy nesta rodada. A configuração temporária do Turbopack usada no worktree não faz parte da entrega.

Resultados efetivamente executados estão em `VALIDACAO.md`; evidências visuais e logs locais ficam em `outputs/operation-dashboard-review/` e não são versionados. Fixtures e consultas simuladas não comprovam uma sessão produtiva real.

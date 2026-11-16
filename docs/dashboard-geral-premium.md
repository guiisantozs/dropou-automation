# Dashboard geral premium

Implementação e refinamento de 16/11/2026, na branch exclusiva `codex/general-dashboard-premium`, baseada na `main` limpa `ec04a14`. Trabalho isolado em `outputs/general-dashboard-worktree`: a branch experimental do Mercado Livre e seu arquivo local foram preservados. A rodada inicial não integrou/publicou; a autorização posterior para main/GitHub e a extensão às demais abas estão em `workspace-operational-premium.md`.

## Apresentação

O escopo `brand=all` recebe o painel claro: sidebar branca arredondada, navegação ativa preta, fundo #F1F1F1, três painéis superiores, agenda, ofertas pequenas, atividade recente, cards de produtos escuros e resumo independente dos canais. As operações individuais mantêm seus temas. As ações e páginas existentes continuam acessíveis; Curadoria e Criar oferta pedem a operação adequada antes de abrir o fluxo existente.

A segunda rodada refinou a UI já criada: Manrope local (equivalente à referência; a fonte exata da imagem não foi identificada), pesos e espaçamentos consistentes, pequenos acentos laranja, anéis concêntricos, logos discretos dos marketplaces, ícones dos canais e botões compactos. Os estados usam os dados existentes. O botão de WhatsApp continua copiando a legenda; não confirma um envio. Não houve nova alteração de backend nessa rodada de polish.

Fontes WOFF2 e logos são assets locais, sem chamadas a CDNs durante a navegação. Licenças e procedência: `public/fonts/Manrope-OFL.txt`, `public/brand-marks/LICENSE.md` e `public/brand-marks/SOURCES.md`.

## Dados e limites

A primeira rodada acrescentou somente a leitura autenticada `GET /api/dashboard/general`, restrita a administradores em Todas as operações. Reutiliza o cliente de sessão/RLS, tabelas, views e RPCs existentes. Não usa service role, manutenção de salvos, consultas Shopee/Mercado Livre ou funções de escrita. Nenhuma alteração de schema, políticas, agendador, autenticação, transporte ou publicação.

- Visão geral: aprovadas sem publicação, curadoria pendente, rodadas confirmadas e destinos agendados são métricas diferentes.
- Atividade semanal: sete dias no fuso Bahia; Telegram exige recibo, WhatsApp exige confirmação manual. Copiar/preparar não entra no gráfico. Recibo do bot não é apresentado como prova de que o disparo foi automático.
- Distribuição: somente produtos cadastrados ativos, sem rejeitados. Cada produto ocupa uma etapa: publicado, agendado, aprovado aguardando publicação ou pendente. Republicações não duplicam produtos. Achados ainda sem cadastro não entram no denominador.
- Resumo dos canais: rodadas publicadas, ofertas salvas como prontas sem envio/agendamento/erro ativo, e destinos agendados permanecem separados por canal.
- Próximas publicações: os três primeiros destinos `queued/ready`, inclusive atrasados; os atrasados e estados de atenção são sinalizados. A ordenação não depende da primeira página da agenda.
- Histórico completo e próximos destinos usam dados do servidor. O painel não transforma dados indisponíveis em métricas zero: exibe erro e, em atualização, identifica que a versão anterior permanece visível.
- Produtos aprovados: paginação de 24 pelo banco. Página e retorno/scroll são mantidos por conta e escopo. A cópia relê a oferta no escopo do produto e aplica os bloqueios existentes.

As leituras internas são paginadas e ordenadas. O limite defensivo é de 50 mil registros por conjunto; ao excedê-lo, o resumo falha explicitamente em vez de apresentar um total truncado. A curadoria mantém seu próprio limite existente. Consultas separadas não são um snapshot transacional único: operações simultâneas podem produzir pequenas diferenças transitórias, corrigidas ao atualizar.

## Validação executada

- `npm.cmd test`: **323/323**, incluindo três novos testes de distribuição, fontes/datas do gráfico e paginação/falhas de leitura.
- `npm.cmd run typecheck`: aprovado durante a implementação e após o polish.
- `npm.cmd run build`: aprovado antes e depois do polish, com a raiz local de QA indicada abaixo.
- `scripts/check-general-dashboard.mjs`: **12 verificações** com os componentes reais e fixtures, estados preenchido/vazio em **320, 375, 768, 1024, 1200 e 1440 px**; sem overflow, fotos invadindo nomes, controles cortados ou imagens quebradas. Menus nativos conferidos. Capturas desktop/mobile inspecionadas.
- `scripts/check-general-dashboard-live.ts`: aplicação Next real com conta fictícia e APIs interceptadas; fonte/logos, filtro do gráfico, cópia exata da legenda após leitura autenticada do escopo, deep link Telegram, restauração de página, falha/recuperação do resumo, seletor de operação e Escape, cinco larguras e isolamento de Celulares aprovados. **Zero escritas de API e conexões externas** nessa execução final.
- GET local real de `/api/dashboard/general` sem sessão: **401**.

O worktree reutiliza `node_modules` por uma junction. O Turbopack precisou de uma configuração temporária de raiz para alcançar essas dependências; esse arquivo de QA é removido antes da entrega. Nenhuma configuração absoluta da máquina é incluída na implementação.

As verificações não comprovam uma sessão produtiva nem os totais reais do banco remoto. Não houve postagem real, mudança remota, consulta de produtos externa, ativação de rotina, teste de MTProto ou extensão. A leitura remota autenticada do novo consolidado fica para a revisão em ambiente autorizado.

## Prévia

`scripts/review-general-dashboard.tsx` gera HTML a partir dos componentes implementados e dados demonstrativos em `outputs/general-dashboard-review/`, ignorado pelo Git. A prévia local em `http://127.0.0.1:4193` não tem ações reais nem acesso ao backend. Atualizar a página mostra a versão gerada mais recente. O estado vazio está em `/empty`.

Arquivos principais: `general-dashboard.tsx`, `general-brand-marks.tsx`, `general-dashboard.css`, `general-dashboard-polish.css`; integrações pequenas em `dashboard.tsx`, `workspace-sidebar.tsx`, `workspace-state.tsx` e `layout.tsx`. A primeira rodada acrescentou também `lib/general-dashboard.ts`, `server/general-dashboard.ts` e a rota de leitura. Scripts e testes ficam nas pastas existentes.

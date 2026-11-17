# Agendamento em lote e central de agendamentos

Implementação em `main`, base `4528634`. Após autorização do usuário para GitHub/Vercel, a migração incremental foi aplicada em produção em 17/11/2026. O SHA e o estado final do deploy são conferidos no relatório de entrega. Nenhum envio real foi realizado como teste.

## Como usar

O mesmo componente atende exclusivamente **Meus links Shopee**, **Catálogo** e **Agendamentos**, nas operações e canais já permitidos. O Dashboard não recebe controles de lote. O botão Conferir continua abrindo o QuickOfferModal existente.

Nas duas listagens, marque produtos individualmente ou selecione a página. A seleção acompanha paginação e filtros, até 50 itens. Representações do mesmo produto no catálogo e na biblioteca são deduplicadas pelo ID canônico. Produtos já publicados não entram na seleção automática; republicar exige intenção explícita.

Em Agendamentos, use Agendar produtos, Agendar primeiros produtos ou um horário da rotina real da operação. Horários passados sugerem sua próxima ocorrência, com data visível. Todos os horários usam America/Bahia.

No modal compartilhado:

1. Escolha operação autorizada, destino, data e horário. Um lote pertence a uma única operação e canal.
2. Pesquise e selecione os produtos. Não conferidos também aparecem; publicação anterior e sua data ficam identificadas.
3. Abra a revisão coletiva. Confira preço, disponibilidade, variante, link, foto e legenda apresentados. Pendências aparecem por produto; é possível corrigir pelo modal existente ou retirar o item.
4. Confirme a revisão e agende os válidos. O resultado discrimina agendados e falhas. As falhas permanecem selecionadas para correção; não são repetidas automaticamente.

Salvar um link não aprova nem publica um produto. Na leitura remota desta tarefa, Toque de Beleza tinha links salvos e zero produtos aprovados: a diferença era legítima. O texto do Dashboard agora explica essa separação. A aprovação só ocorre para itens válidos após confirmação da revisão coletiva, junto ao agendamento.

## Garantias e limites

- Uma preparação e uma confirmação por lote, pelo backend autenticado; o navegador não dispara dezenas de agendamentos independentes.
- A revisão é persistida com responsável, destino, snapshots e legendas. Expira após 30 minutos; o horário deve ser futuro, em até 180 dias.
- Confirmação usa transação e bloqueios em ordem estável. UUID, impressão da solicitação e resultado persistido tornam repetição e duplo clique idempotentes. O mesmo UUID não aceita dados ou responsável diferentes.
- Cada item revalida permissões atuais, operação, retenção, cadastro e legenda concorrentes, preço, disponibilidade conhecida, link, apresentação e envios já existentes. Produtos expirados, rejeitados ou arquivados não são restaurados pelo lote. Não há consulta externa automática de preço ou estoque.
- A revisão humana não substitui as validações técnicas existentes. Estoque explicitamente indisponível e faixa de preço sem variante conferida bloqueiam o item. Dados insuficientes precisam ser corrigidos.
- Falhas por item não impedem os demais válidos. Repetir a confirmação devolve o resultado original, sem tentar novamente as falhas.
- Republicações usam a intenção existente e preservam eventos/recibos anteriores. Mudança no histórico após a revisão exige nova preparação.
- Autenticação, `publicationAdmin`, associação atual, RLS e isolamento por operação são mantidos. Clientes não escrevem diretamente nos lotes; tokens continuam somente no servidor.
- Agendar não marca como publicado. Somente o fluxo existente de entrega/recibo registra envio. Entregas incertas/parciais não são repetidas automaticamente.

## Executor e dependências de produção

A leitura remota confirmou o único pg_cron `dropou-telegram-dispatch` ativo, a cada minuto, com execuções recentes bem-sucedidas. As três operações beleza/casa/natal estavam com canais configurados/verificados e automações pausadas. Nada disso foi alterado.

O lote reutiliza a fila e o dispatcher existentes: até **um produto por execução/minuto**, em ordem no lote. O horário é o início de elegibilidade, não uma promessa de entrega simultânea. A consulta de tarefas evita outro envio em andamento do mesmo lote. O claim e os recibos continuam sendo os existentes.

Beleza, casa e natal usam a capacidade de agendamento Telegram explicitamente autorizado já instalada, mantendo suas automações desativadas. Outras operações conservam os controles anteriores de liberação global e por operação. O modal informa quando esses controles estão pausados. Destinos e permissões são revalidados antes da confirmação e pelo executor; salvar o agendamento não garante entrega.

WhatsApp, onde já permitido, continua sendo lembrete com compartilhamento e confirmação manuais. Não foram criados cron Vercel, MTProto, descoberta automática ou novos envios automáticos. Não há variáveis de ambiente ou dependências de pacote novas.

Antes de publicar esta versão:

1. Conferir o histórico do projeto Dropou e aplicar **somente** `supabase/migrations/20261117023230_bulk_scheduling_workspace.sql`, registrando a versão. Não reaplicar schema, seeds ou migrações antigas.
2. Verificar tabela/RLS, grants das RPCs, colunas de vínculo da fila e funções de leitura de tarefas/agenda. A migração não habilita automações nem altera destinos ou recibos existentes.
3. Publicar a aplicação correspondente e conferir disponibilidade, cron existente e configurações de cada operação. Teste real de mensagem depende de autorização específica do usuário.

A migração foi gerada pela CLI oficial e validada com a cadeia histórica em PGlite. Na publicação autorizada, foi aplicada somente a versão `20261117023230`, com DDL e histórico na mesma transação. O conteúdo registrado foi comparado ao arquivo local; RLS, grants e novas colunas foram conferidos. Consultas reais sob `authenticated`, em transação `READ ONLY` encerrada com rollback, validaram as três agendas/listas e o bloqueio de outra operação. Advisors sem novos avisos, cron único e automações pausadas preservados; nenhum lote/job de teste criado. As verificações com mocks/fixtures não comprovam uma entrega real de lote pelo Telegram.

## Arquivos alterados

| Área | Arquivos |
| --- | --- |
| Componente e regras compartilhadas | `src/components/batch-scheduling.tsx`, `src/lib/bulk-scheduling.ts` |
| Backend autenticado | `src/app/api/schedule-batches/route.ts`, `src/server/bulk-scheduling.ts` |
| Central e tipos | `src/components/publication-schedule.tsx`, `src/lib/publication-workspace.ts` |
| Entradas nas listagens | `src/components/catalog-parts.tsx`, `src/components/catalog-workspace.tsx`, `src/components/shopee-saved-products.tsx` |
| Texto e apresentação | `src/components/general-dashboard.tsx`, `src/app/bulk-scheduling.css`, `src/app/layout.tsx` |
| Banco incremental | `supabase/migrations/20261117023230_bulk_scheduling_workspace.sql` |
| Testes | `tests/bulk-scheduling.test.ts`, `tests/bulk-scheduling-ui.test.ts`, `tests/channel-ui.test.ts`, `tests/scheduling-workspace-ui.test.ts` |
| Documentação | Este guia, `AGENTS.md`, `VALIDACAO.md` |

## Validação

`npm.cmd test`: 537/537; `npm.cmd run typecheck` e `npm.cmd run build` aprovados. Cobertura de RLS, acesso revogado, confirmação, retenção, snapshots, faixa de preço, estoque, republicação, histórico, idempotência, falhas parciais e execução ordenada em PGlite/fixtures.

Chrome com APIs interceptadas e rede externa bloqueada: 300 combinações de página/largura, nove operações, três entradas respeitando as bibliotecas existentes, incluindo seleção, revisão e resultado parcial. Após o acabamento de contraste/alinhamento, mais 108 combinações de beleza/casa/natal passaram; capturas desktop e celular inspecionadas. Mais 13 verificações HTTP nas rotas Next reais com Auth/DB/Telegram simulados, incluindo 401/403, operação adulterada, token ausente, confirmação obrigatória e replay. Nenhum método de envio Telegram foi chamado nessa verificação HTTP. Artefatos locais ficam em `outputs/`, ignorado pelo Git.

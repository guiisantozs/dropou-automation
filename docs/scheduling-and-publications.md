# Agendamentos e Publicações

Agendamentos mostra exclusivamente destinos ainda pendentes. Publicações mostra os comprovantes Telegram e as confirmações manuais WhatsApp, inicialmente apenas de hoje, no fuso America/Bahia. Os links antigos `?view=posts` continuam abrindo a agenda; os endereços atuais usam `?view=schedule` e `?view=publications`.

## Operação

- A agenda agrupa produto e marca, com data exata por destino, miniatura, preço e controles compactos. Um destino concluído desaparece; os outros permanecem. Os indicadores consultam toda a fila autorizada, independentemente da página exibida.
- Editar horário conserva os dados, a legenda e o destino aprovados. Cancelar afeta somente a plataforma selecionada. Envio em andamento, parcial ou incerto não permite edição/reenvio pela agenda. Nenhuma ação de leitura envia mensagens.
- Telegram exige confirmação real da API e IDs de mensagem. Marcações Telegram antigas sem recibo ficam preservadas no histórico de auditoria, identificadas como tal, sem contar como entrega confirmada.
- WhatsApp continua manual. A confirmação exige que o operador declare ter realizado o envio; um lembrete pendente da mesma plataforma é encerrado na mesma transação. Telegram permanece independente. Corrigir a confirmação exige novo consentimento, preserva o registro original e gera auditoria; não reativa o lembrete.
- Publicações inclui Hoje, Ontem, Últimos 7 dias, Este mês e intervalo personalizado, além de canal/plataforma e operador para administradores. A ordenação é decrescente, com 20 registros por página. Registros do mesmo produto, marca e dia ficam agrupados dentro da página; todos os destinos e rodadas continuam individualizados.
- Datas efetivas vêm dos comprovantes/confirmações, sem substituir uma data ausente pelo cadastro do produto. Operadores históricos desconhecidos não são inventados. Novos registros guardam o ator real; recibos guardam o responsável daquela rodada, mesmo após nova programação.

## Fonte de verdade e acesso

`dropou_confirmed_publications` reúne comprovantes por marca/plataforma, com `security_invoker`. Os resumos e métricas consultam essa mesma fonte. Todas as consultas respeitam proprietário, RLS e canais autorizados; operadores não ganham acesso a outras marcas usando o filtro Todos. As rotas autenticam com `sessionDb` antes de usar `publicationAdmin` nas escritas privilegiadas.

As alterações invalidam as telas montadas, sem consultar a Shopee. Uma inscrição Supabase Realtime lê somente `publication_updates`: proprietário, marca, revisão e horário, sem legenda, produto ou credenciais. Há comunicação entre abas e releitura ao focar/periodicamente como alternativa caso Realtime não entregue uma notificação. Campos em edição na oferta são preservados.

As escritas privilegiadas usam RPCs só para service_role, com verificação do ator, bloqueio do produto antes da fila e auditoria transacional. Recibos repetidos idênticos são idempotentes. Comprovantes reais, entregas incertas, controles de liberação e o único cron `dropou-telegram-dispatch` continuam protegidos.

## Banco e validação

Migração criada pela CLI: `20261114174019_scheduling_publication_workspace.sql`. Incremental, sem remover registros, alterar migrações anteriores, consultar fornecedores ou ativar rotinas. Aplicada somente ao projeto Dropou `wqpdyfipjsnyzxktacqh`, com histórico da migração na mesma transação.

Validação de 14/11/2026:

- 272/272 testes locais, typecheck, build de produção e diff check aprovados. HTTP no build local: as duas páginas retornaram 200 e as APIs de agenda/publicações recusaram sessão ausente com 401. Servidor temporário encerrado.
- PGlite com o SQL real: destinos independentes, recibos duplicados, ausência de comprovante, falhas/incerteza/parcial, correção manual, edição/cancelamento, preservação de semanas anteriores, autorização de operadores e isolamento das notificações.
- JSDOM com os componentes reais: confirmação antes de mutar, conclusão parcial, invalidação, filtros de data e correção sem novo envio.
- Chrome com fixtures: duas telas em 320/375/768/1440 px, oito combinações sem overflow, imagens quebradas ou erros de página. Capturas desktop/mobile inspecionadas. Isso não equivale a navegação autenticada em produção.
- Leitura remota autenticada em transação read-only/rollback: 36 registros confirmados, sendo 29 Telegram e sete WhatsApp; 14 no dia e nenhum agendamento pendente naquele instante. As 29 entregas e os 146 eventos foram preservados. Contagens podem mudar por operação real do usuário.
- Escritas privilegiadas negadas a anon/authenticated, RLS da tabela de notificações ativo, tabela incluída no Realtime e cron único preservado. Advisors de segurança sem novos achados; permanece o aviso preexistente de proteção contra senhas vazadas desativada.

Não houve mensagem real, consulta Shopee, geração paga ou mudança de credenciais como teste. A validação remota conferiu leituras e estrutura; os cenários de escrita foram exercitados localmente com fixtures/PGlite. O status efetivo de GitHub/deploy deve ser registrado separadamente na entrega.

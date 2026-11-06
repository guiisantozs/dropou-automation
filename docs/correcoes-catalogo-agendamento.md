# Exclusão, publicação visível e retomada dos agendamentos

Correções de 6 de novembro de 2026, em continuidade à implantação dos funis independentes.

## Exclusão

O GTA 6 tinha um vínculo em `ai_drafts.product_id`. A exclusão anterior removia ofertas e preços, mas deixava esse vínculo, causando a recusa por chave estrangeira. A nova função desassocia o rascunho legado e preserva seu conteúdo, remove somente o cache de legenda do produto excluído e mantém o orçamento, os registros de consumo e os demais caches. Produtos com histórico continuam sendo arquivados. Não há alteração em mensagens Telegram.

Além da regressão isolada, a exclusão foi executada com verificações no esquema real, como `service_role`, dentro de uma transação explicitamente revertida. A operação passou; após o `ROLLBACK`, os oito produtos, o GTA e seu rascunho continuaram presentes. Nenhum produto foi removido permanentemente nessa validação. A ação final de excluir continua no diálogo do catálogo.

Referência: [ações de chaves estrangeiras no Supabase](https://supabase.com/docs/guides/database/postgres/cascade-deletes).

## Situação visível por canal

Dashboard e catálogo mostram **Publicado no Telegram**, data e situação independente do WhatsApp. A revisão comercial aparece como **Preço: A conferir**, separada da publicação. Não há inferência a partir do status global do cadastro. A consulta considera recibos e histórico comprovado, inclusive quando uma tentativa posterior falha, e respeita proprietário e paginação.

Próximas publicações usam o horário da fila Telegram, em vez de `products.data.status`. A página atualiza os dados ao recuperar foco e a cada 30 segundos enquanto está visível. O dashboard mostra se a automação está ativa ou pausada. A faixa estreita de ícones duplicados foi removida; navegação, cadastro, ajuda e saída permanecem no menu principal.

## Agendamentos das 17h

O cron estava ativo, executando a cada minuto e recebendo HTTP 200, mas `automation_enabled` permanecia falso. A resposta de pausa não era uma falha de cron. O usuário confirmou que publicou no Telegram o kit de ventoinhas, o cartucho SNES e a placa de vídeo. Os três já possuíam recibos reais: `14`, `15` e `16`, às 17h32, 17h33 e 17h34 de São Paulo. Esses registros foram preservados. O total verificado passou a ser cinco entregas Telegram e nenhuma confirmação WhatsApp.

O usuário autorizou ativar **apenas os próximos agendamentos**. A retomada agora é transacional: registra um horário de corte, retém os agendamentos vencidos para revisão e preserva os já enviados, parciais e incertos. Repetir a ativação não move o corte nem cria envios. A execução automática também verifica o corte antes de reservar a entrega. Para um horário retido, é necessário abrir a oferta e reagendar explicitamente depois de conferir o canal.

O botão passou a se chamar **Ativar próximos agendamentos** e informa a quantidade retida. Salvar um agendamento com a automação pausada exibe um aviso explícito de que não haverá envio até a ativação.

## Validação e implantação

- 145 testes passaram, incluindo a reprodução da falha antiga com o rascunho legado, cache e consumo preservados, isolamento entre proprietários, comprovantes por canal e retomada sem repetir horários vencidos.
- TypeScript, build de produção e verificação de diferenças passaram.
- A migração versionada `20261106203815_fix_catalog_delete_and_schedule_resume.sql` foi aplicada no Supabase como `20261106205151_fix_catalog_delete_and_schedule_resume`. As funções mantêm `security invoker`; retomada e exclusão são restritas ao serviço e os resumos exigem o proprietário autenticado.
- Nenhum novo alerta de segurança apareceu. Permanecem os avisos anteriores de tabelas privadas com RLS sem política pública e [proteção de senhas vazadas desativada](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection).
- Não houve chamada paga nem mensagem de teste. As ferramentas não encontraram navegador conectado; a validação de interface usou renderização e interações simuladas, sem capturas reais de desktop/mobile.

O commit `a5d5155` foi enviado ao `main` e publicado como `dpl_KZUFvmDcuU5ARcrF3ZYte4qWRXwB`, com estado `READY`, no domínio https://dropou-automation.vercel.app. A conferência retornou HTTP 200, encontrou os estilos dos novos status e do aviso de automação e confirmou a ausência dos estilos da faixa duplicada.

A ativação autorizada foi concluída às **17h54min56s de São Paulo**, com corte para os próximos horários. Não havia agendamentos vencidos pendentes para reter nem itens na fila. Às 17h55, o cron respondeu HTTP 200, `processed: 0`, sem pausa ou timeout. Os recibos `14`, `15` e `16` permaneceram intactos; os totais continuaram em cinco entregas Telegram e zero confirmações WhatsApp. Nenhuma oferta foi reenviada na validação.

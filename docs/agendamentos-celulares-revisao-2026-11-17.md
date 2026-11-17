# Celulares: investigação e correção de agendamentos

Implementação em `codex/scheduled-publication-review`, worktree `outputs/scheduled-publication-review`, base `6cb8a0b`. A árvore original `codex/mercado-livre-product-import`, com suas alterações não commitadas, foi preservada integralmente. A etapa inicial foi local; a autorização posterior para instalar no site está registrada ao final. Nenhum envio, ativação ou alteração dos agendamentos reais foi executado como teste.

## O que ocorreu nos registros reais

Leitura somente de leitura do proprietário autorizado e da marca `celulares`, atualizada em **17/11/2026, 14:11:40 America/Bahia**. Os dez registros estavam `queued`, com **attempts=0**, `started_at=NULL`, `sent_at=NULL`, `error=NULL`, nenhum ID de mensagem e nenhum recibo correspondente à rodada. Cada um tinha somente o evento inicial `queued`. Não há falha de envio comprovada nesses registros: seis estavam atrasados e quatro ainda eram futuros nessa leitura.

| Hora em 17/11, Bahia | Produto resumido | ID do agendamento | Classificação na leitura | Erro persistido / tentativa / recibo |
| --- | --- | --- | --- | --- |
| 08:00 | Kit completo iPhone | `86154ad5-869b-402d-906b-8a4f2dc65211` | Atrasado | NULL / 0 / ausente |
| 08:00 | Kit carregador 67W + cabo | `02985405-8b09-4665-b61b-3e586d422161` | Atrasado | NULL / 0 / ausente |
| 09:00 | Capinha marinha azul | `803a0cf9-9b7d-4e10-ac35-710384ce159a` | Atrasado | NULL / 0 / ausente |
| 10:00 | Motorola Moto G17 | `94ff5e06-6f3d-4615-b58c-e524be90083d` | Atrasado | NULL / 0 / ausente |
| 11:00 | Carregador magnético 15W | `f5dd9b50-5819-43a1-a807-6c40c0e77959` | Atrasado | NULL / 0 / ausente |
| 13:00 | Capinha aveludada | `70414380-0ef5-4304-b832-63441a6cf169` | Atrasado | NULL / 0 / ausente |
| 15:00 | Carregador 168W | `f56727b6-6ec5-443f-a922-5a331d119ec7` | Agendado para o futuro | NULL / 0 / ausente |
| 16:00 | Smartphone HOTWAV | `8c1d191b-fca3-4e26-8c13-b8417a14b4bb` | Agendado para o futuro | NULL / 0 / ausente |
| 17:00 | Capinha Demon | `a4dd1385-22cf-4277-b97b-f3e930d0676b` | Agendado para o futuro | NULL / 0 / ausente |
| 23:00 | Carregador sem fio 5000/10000mAh | `361a688d-1ff6-46d6-b3cb-a836d849d57a` | Agendado para o futuro | NULL / 0 / ausente |

**Causa comprovada da retenção:** configuração global ativa, mas `operation_settings.automation_enabled=false` para Celulares. O seletor SQL existente exige a liberação dessa operação; a consulta remota encontrou zero jobs de Celulares elegíveis por essa política. Nenhum desses dez chegou ao claim/envio. Não há evento ou recibo que indique chamada de envio ao Telegram para eles.

O cron único `dropou-telegram-dispatch` estava ativo a cada minuto. Foram conferidas cinco execuções recentes do pg_cron, todas `succeeded`, de 14:08 a 14:12 Bahia. Isso comprova a execução do agendamento no banco; não transforma os jobs pausados em tentativas de entrega. Não existe necessidade demonstrada de criar cron Vercel ou duplicar o executor. O seletor mantém um job por invocação e a ordem de lotes existente.

Canal salvo, bot vinculado e verificação cadastral estavam presentes. A credencial dedicada de Celulares não está no ambiente local; a conferência adicional do bot não executou chamadas. Portanto, a permissão atual na API Telegram não foi reconfirmada nesta tarefa. Nenhuma variável privada foi baixada da Vercel. A liberação operacional deve conferir essa permissão pelo fluxo existente.

## Desconto: defeito reproduzido, sem atribuição indevida aos dez jobs

As dez legendas analisadas não continham porcentagem nem menção a desconto/economia; `previousPrice=NULL`, `previousVerified=false`, disponibilidade confirmada e preço coerente com a legenda. Passaram nos validadores atuais. Não há prova de erro de desconto ou de preço expirado nesses dez registros.

Foi reproduzida uma divergência compartilhada: `savedCaptionError`/`captionError` aceitavam uma legenda com preço correto e “Economize!” sem preço anterior comprovado. `publicationCaptionError` e o SQL de publicação recusavam essa mesma legenda. Isso permitia salvar uma edição ou considerá-la válida na preparação do lote, seguida de recusa na etapa mais estrita. O SQL de agendamento já recusava essa alegação; não foi demonstrado que ele aceitou uma legenda inválida nos casos reais. O reagendamento antigo também recolocava jobs na fila sem validar novamente sua legenda.

Agora a validação comercial comum verifica valores, percentuais, desconto/economia e alegações não comprovadas já no salvamento e na revisão do lote. A geração local conserva os estilos de cada operação, usa desconto apenas com `previousVerified` e preço anterior superior, e não transfere alegações comerciais de títulos/chamadas/características para a legenda automática. Ausência de desconto continua permitindo oferta normal com o preço atual aprovado.

## Causa comprovada de “Em curadoria” nos cards

Os dez produtos estavam vinculados aos respectivos registros salvos. A API lia jobs por proprietário/marca, mas consultava `dropou_product_channel_summaries` pelo cliente administrativo. Essa função usa `private.dropou_workspace_owner()` e precisa do contexto autenticado; retornou **zero** linhas nesse cliente.

Uma segunda verificação, em **BEGIN READ ONLY / papel authenticated / ROLLBACK**, com escopo Celulares, retornou **dez jobs, dez resumos e zero jobs de outras marcas**. A correção usa `sessionDb` nessa RPC, preservando RLS, e mantém os dados administrativos já limitados ao proprietário/marca. O modelo visual também consulta os jobs reais quando o resumo está ausente, em vez de deduzir publicação da curadoria.

Os cards distinguem preparação, agendamento, atraso, falha, bloqueio, processamento e incerteza. O desenho mostra um status curto, data/hora com o canal e o destino; o motivo fica recolhido em “Ver motivo”. Não repete data, selo de curadoria ou uma caixa estreita com o mesmo agendamento. As ações ocupam uma linha própria no celular e na grade. Recibo sem IDs não vira publicação confirmada. Catálogo/dashboard sinalizam fila vencida como atrasada. A agenda coloca lotes com algum job problemático em atenção, mesmo quando o primeiro item está agendado. O botão Conferir continua no QuickOfferModal existente, e os eventos de atualização existentes recarregam as listas após ações confirmadas.

## Agendar confirma a revisão em todo o site

Conforme a orientação posterior do usuário, o próprio clique final em **Agendar** confirma o produto, preço, foto e legenda exibidos. Isso vale nas nove operações cadastradas, tanto no modal compartilhado quanto na página completa da oferta. A ação salva a versão exibida com `review=true`, usa a confirmação humana existente no servidor e depois agenda, sem outro botão “Conferi agora”, salvamento prévio obrigatório ou checkbox de revisão. A curadoria recebe a aprovação dessa revisão; agendar continua sem comprovar publicação.

No lote, o botão **Agendar produtos válidos** confirma coletivamente os itens da prévia e substitui o checkbox redundante. No agendamento em múltiplos canais, **Agendar nos canais** também confirma a ação, mantendo a escolha explícita de destinos. A escolha intencional de republicação e os erros concretos por item permanecem. O modal ganhou um resumo simples de data/hora e destino. Publicação imediata e confirmação de envio manual WhatsApp mantêm seus próprios controles.

A confirmação é humana, não uma nova observação da API. O servidor continua recusando disponibilidade registrada como falsa, preço divergente, alegações sem prova, produto alterado, fila existente e entrega incerta/parcial. A versão aprovada não pode ser trocada silenciosamente ao salvar: a rotação automática não altera a legenda nesse ato de revisão, e uma divergência do retorno impede o agendamento.

## Preço e autorização

A premissa de uma validade curta universal não corresponde à versão instalada: `20261114155746_persistent_publication_approval` tornou persistente a aprovação humana do snapshot. O `checkedAt` dos jobs não foi renovado pelo agente, e não há vencimento automático de 15 minutos para essa aprovação manual. Um produto confirmado hoje pode ser agendado para amanhã sob essa política; isso não é uma nova consulta à loja nem deve ser apresentado como tal.

A validade curta das observações oficiais Shopee permanece separada, em `priceCurrent` e no worker de jobs `official`. Esse worker já tenta revalidação sob orçamento e retém o envio se não houver preço válido. Ele foi preservado, sem novas consultas de produto nesta investigação, sem ampliar limites e sem converter seus jobs em envios manuais. Não foi acrescentada uma política de alteração silenciosa da legenda/preço de agendamentos manuais nem um modo sem preço por padrão. As dez autorizações analisadas mantêm `allow_safe=false`.

## Correção e reagendamento com consentimento

“Corrigir legenda” prepara comparação antes/depois, usando o preço do cadastro atual aprovado e retirando o desconto não comprovado. O primeiro clique troca somente a prévia. Na agenda, é preciso aceitar a versão e confirmar uma nova data futura antes de salvar/reagendar. O modal consulta dados atuais do produto, enquanto o snapshot original do job continua preservado para auditoria. Dados alterados concorrentemente ou ainda sem conferência provocam recusa e pedem reabrir a revisão.

Agendamentos com dados pendentes devem ser abertos em **Conferir**, revisados e salvos explicitamente; depois a agenda relê o produto aprovado. A proposta não confirma preço ou estoque pelo usuário. Entregas `sending`, `uncertain`, `partial` ou com recibos/IDs não entram nesse reparo. Repetição da confirmação não cria outro job. Jobs oficiais Shopee continuam no worker próprio.

### Migração incremental — preparação e instalação

Arquivo CLI: `supabase/migrations/20261117170847_schedule_caption_review_consistency.sql`.

Acrescenta a RPC `dropou_schedule_review`, `security invoker`, somente `service_role`, com autorização atual do colaborador, locks, comparação de snapshot/legenda, destino, estado e provas de entrega. Preserva o erro/legenda antigos em `channel_events`, atualiza uma única oferta/job e registra a confirmação no audit. Não apaga recibos ou histórico, não cria job extra e não envia mensagem. Também envolve `dropou_schedule_change` para impedir que uma mudança simples de data recoloque legenda inválida na fila; cancelamento e worker oficial conservam o fluxo anterior.

Sem nova tabela, cron, credencial, destino, automação ou relaxamento de RLS. Testada com a cadeia histórica completa em PGlite, incluindo grants padrão. Após a autorização posterior, foi aplicada somente essa migração, como descrito abaixo. Não reaplicar migrations antigas/schema/seeds. Celulares continua pausado e os registros reais continuam sem reparo ou reenvio pelo agente.

## Validação e próximos passos manuais

- Suíte completa **575/575**. Após o acabamento do agendamento em múltiplos canais, **4/4** direcionados; tipos e build de produção local repetidos. O build isolado usou `npm.cmd run build -- --webpack`: Turbopack não resolveu as dependências compartilhadas fora da raiz da worktree; nenhum arquivo de configuração de produção foi alterado para contornar isso.
- PGlite e testes da API real com Auth/REST fictícios verificaram sessão autenticada no resumo, isolamento, descontos válidos/ausentes/incorretos, valores divergentes, amanhã, observação Shopee vencida, estados antes do envio/incertos, curação com fila, recibos, atrasos, lote parcial, confirmação de nova data, concorrência e prevenção de duplicações. Nenhum desses testes chamou APIs reais de publicação ou produto.
- Chrome: **16 combinações**, quatro superfícies em 320/375/768/1440 px, sem overflow, imagens quebradas ou erros de página. Capturas de cards mobile, agenda desktop, comparação mobile e resumo do modal de agendamento inspecionadas. São fixtures renderizadas e componentes interativos testados em JSDOM, não sessão autenticada real no navegador. Evidências ignoradas em `outputs/schedule-caption-visual/`.
- Evidências reais sanitizadas ficam na árvore original em `outputs/schedule-incident/`: inventário, executor, contexto dos cards, RLS e verificação limitada do bot. URLs de rastreamento, tokens e dados de proprietário não constam deste documento.

O administrador ainda precisa conferir os dados comerciais e o bot, escolher novas datas para os atrasados ou cancelá-los, e decidir a liberação da operação pelo controle existente. Os seis atrasados/quatro futuros da tabela são a fotografia das 14:11; os horários posteriores também precisam ser revistos se já passaram. **Ativar a operação com a fila vencida autoriza o executor a processá-la**; a correção não faz essa escolha. Não houve publicação para “testar” o resultado.

## Instalação no site autorizada posteriormente em 17/11/2026

O usuário autorizou aplicar as alterações de agendamento no site. Essa autorização substitui a restrição inicial de merge/deploy desta entrega e não inclui ativar Celulares, corrigir/reagendar os registros reais ou publicar ofertas.

- Aplicada ao projeto Dropou apenas `schedule_caption_review_consistency`, versão remota `20261117184343`, correspondente ao arquivo CLI local `20261117170847`. SHA-256 do SQL instalado e do arquivo local iguais: `949e6b74ba95e0ad86e792830576bdd3260bb9ca31541155b76a9f34895f9449`. Não editar nem reaplicar esse arquivo.
- Conferidas as três funções: invoker, search_path vazio, EXECUTE apenas service_role; anon/authenticated recusados. RLS de produtos/ofertas/jobs permanece ativo. Cron único, flags de todas as operações e configuração global idênticos antes/depois; Celulares false. Produtos/ofertas/jobs/entregas/eventos mantiveram 90/89/71/60/280 durante a instalação. Advisors sem achados novos; os avisos anteriores permanecem fora deste escopo.
- Antes da instalação, repetidos 11/11 testes direcionados, incluindo PGlite com a cadeia histórica e novas guardas de lock/reaplicação, e typecheck. O código da interface conserva a validação anterior de 575 completos, quatro direcionados, build e 16 layouts. Nenhuma API de produto/envio usada para testar a entrega.
- Integração por fast-forward na main e publicação pelo fluxo GitHub/Vercel existente. SHA, estado READY, alias e verificações GET serão registrados nas evidências ignoradas de liberação. Evidência de banco: `outputs/schedule-release-database.json` nesta worktree. As 35 alterações originais de Mercado Livre permanecem fora do commit de agendamento.

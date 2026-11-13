# Gestão de produtos — Dropou Tech & Games

## Fluxo operacional

- **Curadoria** mostra todos os pendentes, 24 por página. Produtos fora dos mínimos automáticos continuam acessíveis para revisão manual, com as observações disponíveis. Aprovar não publica nem falsifica a elegibilidade para o bot. Variações de preço abrem a revisão do produto.
- **Próximos posts** e a fila principal do dashboard mostram aprovados sem publicação em nenhum canal. Uma publicação comprovada ou marcada manualmente remove o produto dessas filas e o coloca no catálogo.
- **Catálogo** mostra publicados, com busca e filtros de loja, canal e período executados no banco antes da paginação. O botão Arquivados / legados dá acesso aos registros preservados.
- **Publicados hoje e ontem** considera America/Bahia, ordena pela última publicação e carrega no máximo 24 produtos. Os anteriores permanecem no catálogo. Esse período não filtra a curadoria.

O indicador e a listagem usam a mesma view `dropou_curation_queue`. Na investigação inicial havia 45 registros `found` relevantes, todos inelegíveis para a rotina automática, enquanto a tela abria em Elegíveis. A nova aba Curadoria não usa esse filtro. Na primeira conferência após a migração havia 44 pendentes reais em páginas de 24 e 20: o outro registro já tinha publicação. Durante a tarefa novas decisões do usuário reduziram a lista a quatro, com indicador e consulta concordando. Essas leituras são snapshots, não contadores fixos.

## Marcar publicação e desfazer

Os botões **Publicado no Telegram** e **Publicado no WhatsApp** registram uma postagem que o administrador já fez. Não enviam mensagens. Cada canal guarda sua própria data e a sua marcação manual. **Desfazer marcação** revoga somente essa marcação; não apaga registros nem reverte recibos reais do bot.

Recibos do Telegram continuam identificados como confirmação do bot. Uma marcação manual não inventa IDs de mensagem ou links de comprovantes. Publicar no Telegram não altera o WhatsApp. Uma entrega em andamento, incerta ou parcial exige revisão e não pode ser mascarada com uma marcação manual.

Para repostar manualmente, abra o catálogo, revise/salve a oferta se necessário e use **Repostar manualmente → Copiar legenda para repostar**. Após postar, **Registrar repostagem** cria um novo registro do canal, reutilizando o mesmo cadastro de produto. A postagem anterior continua no histórico. Republicações pelo bot que já tinham recibo preservam o fluxo explícito de autorização existente.

## Legados e rejeições

A migração arquivou uma única vez os seis produtos Mercado Livre existentes no Dropou. Cinco já estavam arquivados, e o único ativo saiu das telas operacionais. O motivo `mercado_livre_before_product_operations` identifica a origem. Não existe rotina ou trigger para arquivar novos produtos dessa loja. Integração, configuração e cadastro Mercado Livre continuam disponíveis.

Rejeições persistem no cache ou no estado de curadoria do cadastro e não voltam automaticamente à fila. O cache histórico não é apagado. Cadastros que receberam marcações manuais também passam a ser arquivados quando removidos, preservando seu histórico.

## Implementação e custo

- UI `product-operations.tsx`, rota autenticada `/api/product-operations`, integração no `dashboard.tsx` e estilos em `premium.css` mantêm preto, laranja e tons prateados.
- Novos estados `products.curation_state` e `product_channel_marks`; views com `security_invoker=true`, RLS de proprietário/marca e RPCs de escrita exclusivas do servidor. Autenticação normal não pode inserir ou editar as marcações diretamente.
- As telas leem somente Supabase/cache. A navegação não inicia busca Shopee/Mercado Livre nem geração paga. Pesquisa/filtros são aplicados explicitamente. A atualização automática é limitada à tela visível, a cada minuto, com intervalo mínimo para evitar leituras duplicadas no foco. O dashboard não mantém também a antiga consulta operacional em paralelo.
- A seleção automática mantém suas regras de qualidade, orçamento e proteção de duplicidade. Marcações Telegram entram na proteção contra repetição. As filas também rejeitam produtos arquivados/rejeitados ou já marcados no canal sem autorização apropriada.
- `PublicationHistory latest` aplica hoje/ontem no servidor. Marcações e revogações têm entradas distintas das confirmações do provedor.

## Migrações e validação

Migrações locais geradas pela CLI oficial, sem reescrever as anteriores:

| Arquivo | Versão remota aplicada |
| --- | --- |
| `20261113145637_product_operations_lifecycle.sql` | `20261113152314` |
| `20261113152139_preserve_pending_manual_drafts.sql` | `20261113152653` |
| `20261113152632_operational_lookup_indexes.sql` | `20261113153011` |

Validação: 233 testes completos, tipos e build aprovados; 19 testes PGlite direcionados após os refinamentos incrementais. O teste usa 45 pendentes, percorre as páginas, rejeita/aprova, marca/desfaz canais, mantém o recibo independente, registra repostagem sem duplicar produto e confere recência, RLS e novos cadastros Mercado Livre. Chrome com fixtures: 12 combinações de dashboard/curadoria/catálogo em 320/375/768/1440 px, com capturas desktop/celular inspecionadas. Uma captura Chrome falhou transitoriamente e a repetição final passou.

Leituras remotas com papel authenticated confirmaram contagem/lista, seis legados arquivados, zero Mercado Livre ativo, preservação dos cadastros Shopee e proibição de escritas diretas nas marcações. A quantidade Shopee mudou de dez para doze durante ações do usuário; o agente não importou produtos nem marcou publicações como teste. Não houve mensagem, chamada de produto externa, ativação de rotina ou alteração de destinos/credenciais pelo agente.

Advisors de segurança mantiveram os dez INFO anteriores e o aviso preexistente de [proteção contra senhas vazadas](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection). A revisão de desempenho motivou os índices para as novas consultas/FK; outros avisos históricos de índices permanecem fora deste escopo. Referências: [RLS](https://supabase.com/docs/guides/database/postgres/row-level-security), [paginação](https://supabase.com/docs/reference/javascript/range) e [índices de chaves estrangeiras](https://supabase.com/docs/guides/database/database-linter?lint=0001_unindexed_foreign_keys).

As verificações visuais usam fixtures, não uma sessão de navegador autenticada em produção. Aplicar migrations ou testar localmente não comprova deploy; a confirmação de GitHub/Vercel será registrada na entrega.

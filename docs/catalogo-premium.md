# Catálogo premium compartilhado

Implementação local na branch `codex/catalog-premium`, baseada em `937c184` (acessos e dashboards da Karen). Não altera a main, o experimento Mercado Livre, credenciais, bots, cron ou rotinas de envio. O deploy Git desta branch também fica desativado em `vercel.json`.

## Interface e componentes

`CatalogWorkspace` substitui os dois caminhos anteriores do catálogo: operações Shopee/locais e operações legadas/consolidado. Uma única consulta paginada traz até 24 itens, contagem real, categorias autorizadas e resumos dos destinos. O catálogo não chama provedores, gera legendas ou executa limpeza ao carregar. As outras telas continuam usando seus componentes existentes.

- `CatalogBanner`: composição horizontal compacta. Tech & Games reaproveita o asset próprio `shopee-gaming-hero.webp`; demais nichos usam miniaturas dos produtos realmente recebidos e ilustrações vetoriais dos respectivos nichos quando não há fotos. Sem URLs inventadas, novas imagens armazenadas ou geração em runtime.
- `CatalogProductRow`, `CatalogExpiration`, `CatalogPin` e `CatalogDestinationBadges`: lista horizontal, miniatura contida, nome em duas linhas, preço, categoria, marketplace, destino, última confirmação e retenção. No celular, as informações se reorganizam dentro da mesma linha de produto, sem grade vertical de cards.
- `MarketplaceBadge`, `ChannelMark`, `ProductMedia` e `Dialog` são reutilizados. Os estilos novos usam `--canvas`, `--surface`, `--subtle`, `--border`, `--ink`, `--primary` e tokens relacionados. Nenhuma paleta das operações foi alterada. Todas as Operações preserva o tema administrativo claro.
- Busca com debounce por nome, marca, modelo e identificação disponível; marketplace, categoria cadastrada, operação autorizada no consolidado, publicados/nunca publicados/destinos faltantes/arquivados/rejeitados, plataforma, período de publicação, retenção e fixados. Estados de interface são separados por conta/operação. Não armazenam os produtos em sessão.
- Fixação atualiza localmente a linha; desafixar um item já vencido o retira imediatamente do filtro ativo. A ação não renova o prazo. A API mantém verificação de sessão, proprietário e marca antes da escrita privilegiada e audita o ator.

## Republicação e comprovantes

Republicar abre o `QuickOfferModal` existente na página, preservando URL, filtros e rolagem. Reutiliza o produto e a legenda salva. Mostra os destinos confirmados e os configurados ainda pendentes; clicar no destino pendente seleciona sua plataforma. A autorização de republicação e `MultichannelPublication` existentes ficam em Mais opções, com seleção explícita de canais adicionais autorizados.

Não há nova consulta automática à Shopee/Mercado Livre. A revisão usa os métodos de preço, estoque, link, foto e validade já existentes. A janela informa que o snapshot não é uma consulta atual ao provedor e exige confirmação explícita da conferência na loja antes de republicar/agendar. Revisão vencida continua exigindo salvar/conferir. Envio já realizado, agendamento existente, resposta incerta ou parcial não ganha repetição automática.

Telegram só conta com recibo real. WhatsApp continua com cópia manual e confirmação separada; copiar não registra publicação. A fonte é `dropou_confirmed_publications`, com histórico paginado de 20 eventos por produto. Falhas, cópias, agendamentos e resultados incertos não viram confirmações. Destinos alterados deixam de ser tratados como já atendidos.

As antigas `product_channel_marks` não guardavam o nome do destino. A migração acrescenta esse snapshot para novas marcações e preserva os registros anteriores como “Destino não registrado”; não atribui o grupo atual a um evento antigo sem evidência. Recibos e confirmações que já guardavam o destino permanecem intactos. Integrações das três novas marcas continuam bloqueadas como na etapa de multiusuários.

## Regra de retenção — etapa A

Migração incremental local: `20261116202017_catalog_visual_retention.sql`.

1. Todo produto cadastrado passa a ter uma entrada persistida no catálogo. No legado, a data é a criação do produto ou uma entrada mais antiga do link salvo vinculado (salvo + 7 dias), conservando o prazo mais antigo conhecido. O catálogo inclui produtos cadastrados ainda sem confirmação, além de publicados e salvos que completaram sete dias; o cache de descoberta não é confundido com produtos cadastrados.
2. Itens sem fixação ficam ativos por **14 × 24 horas** desde essa entrada. No instante exato do vencimento, saem do filtro ativo. Podem ser consultados em Expirados/Todos os prazos.
3. Fixados ficam disponíveis sem vencimento visual. Desafixar restaura o prazo original: se ele já terminou, o item volta imediatamente aos expirados. Consultas, salvamentos, edição e republicação não renovam a data.
4. Preparar um link salvo transfere fixação e conserva a data mais antiga, sem duplicar uma linha de catálogo para o produto e outra para seu link. A promoção dos salvos continua após sete dias, limitada a 200 por manutenção.
5. A função antiga de manutenção passa a promover salvos **sem excluir produtos, vínculos ou imagens por idade**, inclusive quando chamada pelo dispatcher existente. Não é criado outro cron. Expiração visual não arquiva o produto, cancela o agendamento, altera os comprovantes nem apaga dados.

A data não pode ser adiada por atualização direta autenticada. O servidor só pode antecipá-la para conservar um vínculo mais antigo. As permissões RLS existentes de proprietário/marca continuam valendo nas views com `security_invoker` e nas consultas de histórico. APIs autenticadas negam filtros/IDs fora do escopo.

## Limpeza — etapa B preparada, sem exclusão definitiva

`dropou_catalog_cleanup_plan` e `scripts/plan-catalog-cleanup.ts` produzem somente um relatório: no máximo 100 produtos por execução (teto SQL de 200), com totais de referências a histórico, ofertas, agendamentos e arquivos próprios. Não imprimem produtos, contas, destinos ou credenciais. A função é somente de leitura e exclusiva do servidor; não é executada a cada carregamento. Exemplo, após aplicar a migração e configurar o ambiente privado:

```powershell
node node_modules/tsx/dist/cli.mjs scripts/plan-catalog-cleanup.ts --owner=UUID_DO_PROPRIETARIO --brand=dropou
```

**Ainda requer validação de negócio:** prazo físico de retenção, fontes financeiras/vendas externas, referências de mídia em snapshots e dados temporários realmente descartáveis. Este relatório nunca transforma ausência de confirmação em autorização para apagar. Não há opção de exclusão automática habilitada. A limpeza de arquivos sem referência e a exclusão manual continuam nos fluxos existentes, com suas confirmações e proteções.

Não se duplicam imagens do banner nem fotos do produto; são reaproveitadas as referências existentes. Cache de provedores/orçamentos, leases, logs de auditoria e histórico de publicações não são tratados como lixo. Não foi feita exclusão definitiva nem manutenção remota nesta tarefa.

## Aplicação futura e validação

A migração deste catálogo depende da migração local anterior da Karen, ainda pendente em produção. Quando for autorizada a atualização do banco, aplicar somente as novas incrementais pendentes na ordem, conferindo o histórico remoto. Não reaplicar schema inicial, seeds ou um `db push` indiscriminado. O código novo não deve ir para produção antes dessas migrações e da conferência de permissões. Os e-mails e o vínculo de contas continuam fora desta entrega.

As evidências locais ficam em `outputs/catalog-*.log` e `outputs/catalog-review/`, ignoradas no Git. As capturas são de fixtures identificadas como dados simulados; não comprovam conta produtiva, consulta atual de marketplace ou envio real. A migração foi executada em PGlite, sem aplicação remota. Os resultados finais de testes/build/navegador são registrados em `VALIDACAO.md`.

Arquivos principais: `src/components/catalog-{workspace,parts,repost-context}.tsx`, `src/lib/catalog.ts`, `src/app/catalog.css`, `src/app/api/catalog/route.ts`, `src/app/api/catalog/[id]/history/route.ts`, integração em `dashboard.tsx`, `layout.tsx` e `quick-offer-{context,modal,extras}.tsx`; migração e testes `catalog.test.ts`, `saved-retention.test.ts`, `scripts/check-catalog.ts` e relatório de limpeza acima.

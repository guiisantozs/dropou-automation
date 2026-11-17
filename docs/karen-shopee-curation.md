# Curadoria e afiliação Shopee nas marcas da Karen

Implementação de 16/11/2026, branch `codex/karen-shopee-curation-fix`, a partir da main limpa `82ce5ab`. A primeira etapa foi exclusivamente local. A autorização posterior de GitHub/Vercel e a aplicação incremental do banco estão registradas ao final.

## Diagnóstico e evidências

As marcas beleza/casa/natal tinham sido criadas como espaços manuais, com integrações explicitamente indisponíveis. O problema não era a ausência de uma conta Shopee da integrante:

1. `isShopeeOperation` reconhecia apenas Dropou, Celulares, Tênis e Auto & Moto. `sessionDb` também bloqueava as rotas Shopee nas três marcas novas. O menu escondia a biblioteca e a curadoria escondia Buscar produtos.
2. `product-operations` encaminhava essas marcas para uma listagem exclusivamente manual, sem ler o cache de descoberta. Aprovação de itens do cache era recusada.
3. Não existiam perfis de busca/classificação para os três nichos. A ausência de um perfil caía na classificação Tech & Games. Os valores padrão de preço/métricas também eram os de tecnologia.
4. Leitura remota no projeto Dropou confirmou que os CHECKs de `shopee_offers`, `shopee_saved_products` e `shopee_observations` aceitavam só quatro marcas. A restrição das marcas novas exigia `shopee_config={}`. Trocar apenas botões ou permissões TypeScript não resolveria as escritas.
5. O importador compartilhado não reconhecia `opaanlp` nem extraía o produto de `an_redir`. O primeiro formato já tinha um tratamento separado no diagnóstico MTProto. A identificação agora é compartilhada, com os mesmos controles de hosts/IDs; não copia a afiliação recebida.
6. Um HTTP 200 com nós todos inválidos podia virar uma lista vazia. A resposta de rede agora distingue lista realmente vazia de contrato inválido. Cache antigo inválido continua sendo ignorado, permitindo a consulta oficial existente.

O snapshot remoto consultado encontrou zero buscas/cache/salvos Shopee nas três marcas novas e dois integrantes ativos limitados a beleza/casa/natal. Nas marcas antigas havia, nos sete dias consultados, 12 tentativas Dropou e duas Celulares com estado `provider`, além de sucessos. Esse estado não permite distinguir timeout, HTTP ou erro GraphQL das falhas históricas. Não foi atribuída uma causa específica sem evidência.

As três variáveis de configuração Shopee constam em Production na Vercel. Foram consultados somente nomes/ambientes, sem baixar valores. Isso **não comprova** a validade atual da autenticação Shopee, nem o valor da flag de aprovação. O conector Supabase não tinha acesso ao projeto; a leitura usou a CLI oficial autenticada, com `--read-only`. Não foram consultados e-mails, tokens ou conteúdo privado de mensagens.

## Seleção por nicho

`src/lib/member-curation.ts` centraliza termos de busca, categorias, exclusões, faixas padrão e identificação dos três perfis:

| Marca | Seleção | Exclusões principais | Faixa inicial |
| --- | --- | --- | --- |
| Toque de Beleza | Maquiagem, skincare, hidratantes, perfume feminino, cabelo, manicure e acessórios | Ferramentas, automotivos, games, eletrônicos genéricos, perfume masculino, brinquedos | R$ 3–450 |
| Cantinho & Charme | Objetos decorativos, flores artificiais, iluminação, têxteis e organização com contexto de lar | Eletrodomésticos, eletrônicos, peças, ferramentas e organizadores sem contexto doméstico | R$ 5–600 |
| Clima de Natal | Árvores, luzes, guirlandas, bolas, laços, bonecos e enfeites | Exige contexto natalino; recusa roupas, presentes genéricos, brinquedos, alimentos e canecas | R$ 3–1.000 |

Fluxo: busca explícita → normalização/validação → relevância por produto → preço/variantes → evidências disponíveis → deduplicação → classificação/variedade → decisão humana. Produto fora do nicho não é incluído para preencher a tela. Cadastro manual permanece identificado como escolha do usuário.

Vendas e avaliações ausentes ficam nulas, sem pontos nem quantidade inventada. Os pesos disponíveis são redistribuídos, mas cobertura mínima e pelo menos uma dessas duas métricas continuam necessárias. Os pesos iniciais são vendas 25, avaliação 25, relevância 35, queda de preço observada 10 e tendência observada 5. Comissão não pontua. Desconto informado pela API fica identificado como informado e não pontua nos novos nichos; não se deriva preço anterior dele. Preço precisa estar na faixa configurada. Não há inferência estética da fotografia ou comprovação de “melhor custo-benefício”.

Padrões: nota 4,5 e 20 vendas quando a métrica existe; pontuação 55 e cobertura 45%. A ausência das duas métricas impede recomendação. Faixas de variantes não confirmadas ficam fora da recomendação. Estoque continua desconhecido se a API não o comprova; preparar não afirma disponibilidade.

O administrador pode ajustar termos/faixas/nota/vendas/pontuação/cobertura em Busca e consumo → Critérios da curadoria. A integrante não recebe PATCH de configuração. Exclusões centrais permanecem no código e termos negativos adicionais continuam em `shopee_config.avoid`/Radar. Esses critérios não ativam automação.

## Afiliação central e preparação

Não foram criadas integrações, credenciais ou contas por marca. O fluxo usa:

- Autorização inicial em `sessionDb`, baseada na associação no banco e RLS; proprietário vem do contexto verificado, não do corpo/browser.
- `publicationAdmin` antes das escritas privilegiadas, com o proprietário do workspace.
- `saveShopeeLinks` e `resolveSavedShopeeProducts`: salvam o original antes da consulta, deduplicam e mantêm erros/repetição explícita.
- `resolveShopeeProductLink` e `shopeeProductLink`: HTTPS, hosts explícitos, IDs válidos, HEAD com timeout e até três redirecionamentos. Aceitam produto completo/slug, `opaanlp`, `an_redir` com origem oficial e links curtos suportados. Não baixam HTML ou seguem outros marketplaces.
- `requestProductOffers`: autenticação central com App ID/Secret do servidor e `productOfferV2` com até cinco IDs exatos por requisição. O campo **offerLink recebido da API** é a afiliação usada. Nenhum parâmetro é fabricado e o link de entrada nunca substitui uma conversão fracassada.
- Cache de fatos por proprietário/loja/item com validade de 15 minutos, revalidando identidade, preço, foto e link; decisões/produtos/histórico continuam separados por marca. Membro não lê esse cache central diretamente.
- Preparação reutiliza as RPCs existentes, preserva edição/cadastro canônico e não cria fila/envio. A curadoria já recebe `offerLink` na consulta existente e o reutiliza sem uma segunda conversão em massa.

O formato do link é validado, mas formato sozinho não prova titularidade. A migração acrescenta uma comparação no banco entre URL original/afiliada e a evidência oficial salva pelo servidor, para produtos prontos/aprovados e ofertas Shopee das três marcas. Uma oferta anteriormente validada conserva o vínculo ao editar seus dados, mesmo após retenção dos salvos. Links falsos, de outro produto ou sem evidência não ficam prontos por um RPC direto. Dados incompletos podem continuar como cadastro pendente.

Se a API recusa autenticação, não retorna produto, fornece link inválido ou fica indisponível, o original permanece salvo e o erro permite tentar novamente. Não há fallback para uma URL comum apresentada como afiliada. Não foi implementado um endpoint alternativo `generateShortLink`: o sistema reutiliza o contrato `productOfferV2` existente. Anúncio indisponível nesse contrato permanece pendente, mesmo que exista na loja.

## Consumo, logs e isolamento

- Até três buscas por clique nas marcas novas, uma página por termo e no máximo 50 resultados por consulta. Termos rotacionam de forma limitada; não há busca infinita.
- Cache de busca por proprietário/marca/configuração durante 30 minutos, inclusive quando uma rodada válida não encontra itens. Falha/rodada parcial não ganha cache de sucesso. Mudança de configuração invalida o cache. Leases impedem buscas concorrentes e cliques repetidos.
- Mantidos os limites globais e por finalidade/marca, prioridades de importação, ledger de consumo e cooldown existentes. Nenhum limite foi aumentado. Retentativa é explícita após a pausa; não há loop automático para 401/429/timeouts.
- Auditoria de busca registra estado, chamadas, recebidos/relevantes, cache, prazo e códigos HTTP/GraphQL disponíveis. Não registra cabeçalho de autenticação, corpo bruto do provedor, termos de busca ou credenciais.
- Telegram/MTProto, destinos WhatsApp, cron, marcas antigas, publicações e agendamentos não foram reconfigurados. Novas marcas continuam com envio e automação bloqueados no backend/banco.

## Banco e instalação futura

Migração incremental gerada pela CLI: `supabase/migrations/20261116233816_karen_shopee_manual_curation.sql`. Amplia apenas os três CHECKs necessários, permite filtros Shopee sob pausa obrigatória, acrescenta controle de cache à lease existente e guardas de evidência de afiliação. Funções públicas novas são `security invoker` e executáveis somente por service_role. Helpers privados respeitam RLS. Nenhum novo cron, canal, bot, conta ou rotina.

Na instalação, aplicar **somente essa migração incremental** ao Dropou existente, conferindo o histórico. Não reaplicar schema/seeds/migrações antigas. O script recusa uma assinatura inesperada do claim de salvos em vez de alterar silenciosamente outra implementação. Sua aplicação remota ocorreu somente após a autorização de publicação, conforme registro abaixo; não reaplicar.

## Arquivos e validação

Principais arquivos: `member-curation.ts`, `channel-profiles.ts`, `channel-shopee-config.ts`, `shopee-quality.ts`, `shopee-curation.ts`, `shopee-search.ts`, `shopee-saved.ts`, `shopee-affiliate.ts`, `workspace-brands.ts`, `operator-access.ts`, `domain.ts`, `publication-copy.ts`; serviços `server/shopee/{client,curation,on-demand,saved-products,manual-actions}.ts`; rotas `api/{product-operations,products/lookup,products/resolve,shopee/automation}`; dashboard, biblioteca, ferramentas/critérios e CSS das marcas. O diff do repositório contém o inventário completo.

- **462/462 testes completos** aprovados, com PGlite real local para RPCs/RLS/grants/constraints. A expectativa antiga “Sem integrações” foi atualizada para refletir Shopee disponível e envios desativados. A suíte encontrou uma regressão inicial de cache MTProto, corrigida e coberta pela suíte existente.
- Após acrescentar a conferência transacional de revisão para pronta e preservação do vínculo após retenção, mais **19/19 testes direcionados** passaram em `member-shopee.test.ts`. Essa execução inclui o caso adicional e não representa outra suíte completa. Tipos conferidos novamente; código de produção não mudou nesse acréscimo de teste.
- Regressões novas: categorias e exclusões; métricas nulas/desconto informado; variantes; cache/duplicação/decisões; HTTP 200 inválido versus vazio; afiliação exata da API central; falha de autenticação preservando o original; formatos de URL/host adversário; filtros de integrante/admin; preparação nas três marcas; RPC de curadoria sem fila; bloqueio de decisão repetida; reparo de cache inválido; recusa de link forjado direto no banco; cache de busca por marca/token e flags pausadas.
- Typecheck, build Next de produção e `git diff --check` aprovados. Auditoria local de arquivos versionáveis sem credenciais detectadas.
- Chrome com Next compilado e APIs/Auth simulados, rede externa bloqueada: **36 layouts** (três marcas × curadoria/biblioteca/oferta preparada × 320/375/768/1366 px). Busca com falha e recuperação, aprovação/remoção, importação com erro de autenticação, retry, preparação, salvamento, link central na legenda e botão de envio bloqueado. Administrador salva critérios; integrante não vê operações antigas. Três APIs reais locais recusaram acesso sem sessão com 401. Sem overflow horizontal/erros de página. Capturas desktop/mobile inspecionadas; contraste do hero ajustado com os tokens existentes.
- Logs e capturas sintéticos em `outputs/karen-shopee-*`/`outputs/karen-shopee-review/`, ignorados pelo Git. Nenhuma chamada de produto Shopee, geração paga ou publicação real foi usada nos testes.

Limites: os testes locais não comprovam autenticação Shopee atual, disponibilidade de todo anúncio ou sessão produtiva da Karen. A disponibilidade real da API pode continuar falhando; os novos diagnósticos tornam futuras tentativas investigáveis. Não houve teste real de conversão nesta rodada. A conferência remota de instalação é distinta desses testes e consta abaixo.

## Liberação autorizada

Após o usuário solicitar envio ao GitHub e Vercel, a migração `20261116233816` foi aplicada somente ao Dropou existente, com guarda de histórico/assinatura e DDL + registro na mesma transação. Leitura posterior confirmou duas guardas, três colunas, RLS ativo e as duas RPCs novas invoker, recusadas para anon/authenticated e permitidas somente a service_role. Os advisors de segurança ficaram idênticos antes/depois.

Contagens no preflight e na leitura posterior: 49 produtos, 49 ofertas, 43 entregas e 202 eventos, sem alteração durante esta aplicação. Configurações das nove marcas preservadas; beleza/casa/natal continuam pausadas e sem destino. O cron único existente foi mantido. Nenhuma mensagem, consulta de produto ou geração paga foi executada como teste.

A entrega Git usa a main do repositório existente e o deploy automático já vinculado à Vercel. SHA, estado READY, alias e smoke GET finais ficam no relatório de entrega em outputs ignorados, sem incluir valores privados ou criar um deploy adicional só para registrar o próprio SHA.

## Inventário completo

| Grupo | Arquivos relativos à raiz |
| --- | --- |
| Modelos/permissões | `src/lib/affiliate.ts`, `channel-profiles.ts`, `channel-shopee-config.ts`, `domain.ts`, `operator-access.ts`, `publication-copy.ts`, `shopee-curation.ts`, `shopee-product.ts`, `shopee-quality.ts`, `shopee-saved.ts`, `shopee-search.ts`, `workspace-brands.ts`, `member-curation.ts`, `shopee-affiliate.ts` (todos em `src/lib/`) |
| Servidor | `src/server/general-dashboard.ts`, `operator-audit.ts`, `session.ts`; `src/server/shopee/client.ts`, `curation.ts`, `manual-actions.ts`, `on-demand.ts`, `saved-products.ts` |
| Rotas | `src/app/api/product-operations/route.ts`, `products/lookup/route.ts`, `products/resolve/route.ts`, `shopee/automation/route.ts`, `shopee/saved-products/route.ts` (todas em `src/app/api/`) |
| Interface | `src/components/dashboard.tsx`, `product-operations.tsx`, `shopee-saved-products.tsx`, `shopee-tools.tsx`, `member-curation-settings.tsx`; `src/app/member-workspaces.css` |
| Testes | `tests/member-shopee.test.ts`, `tests/member-dashboards.test.ts`, `tests/redesign-ui.test.ts` |
| Migração local | `supabase/migrations/20261116233816_karen_shopee_manual_curation.sql` |
| Documentação | `AGENTS.md`, `VALIDACAO.md`, `docs/karen-shopee-curation.md` |

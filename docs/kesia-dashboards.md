# Achadinhos da Kess e Nosso Primeiro Lar

Implementação de 20/11/2026 no repositório Dropou, branch `main`, base `c9ae248`. A árvore estava limpa antes da tarefa.

## Operações e fluxos

As operações `kess` (Achadinhos da Kess) e `primeiro-lar` (Nosso Primeiro Lar | Enxoval & Casa Nova) reutilizam os dashboards das integrantes: seletor, visão geral, curadoria, catálogo, biblioteca Shopee, legendas, prévia, publicações, agenda e histórico. Não existem cópias completas dos componentes. Os estados vazios representam a ausência real de produtos e destinos.

Catálogos, decisões, evidências de afiliado, ofertas, agenda e histórico continuam associados a proprietário e operação. Um mesmo anúncio importado nas duas operações tem registros e decisões independentes. A conta solicitada foi criada como integrante, com somente as duas novas operações; login, renovação da sessão, escopo e logout foram confirmados pelo Supabase Auth. Nenhuma senha, e-mail, ID de conta ou credencial foi incluída neste guia ou no código.

Kess busca utilidades, organização, acessórios para celular, eletrônicos acessíveis, acessórios pessoais e presentes úteis. Primeiro Lar busca cozinha, cama/enxoval, banheiro, lavanderia, limpeza e organização funcional; decoração genérica e enxoval de bebê são excluídos. São perfis de tipos concretos de produto, não listas preenchidas aleatoriamente. Dados de avaliação e vendas ausentes continuam desconhecidos. A integração não comprova reputação do vendedor; ela não é inventada nem exibida como verificada.

Os filtros de curadoria por categoria, preço, avaliação e vendas, e a ordenação por relevância, vendas, avaliação ou preço, atuam sobre o cache completo da operação antes da paginação. Cada conta/operação conserva seus filtros. Selecionar um filtro não consulta a Shopee. A pesquisa explícita reutiliza as reservas, limites e cache existentes.

## Identidade visual

`kesia-workspaces.css` contém somente seletores das duas novas operações, importados após os estilos existentes. As cores das operações anteriores foram preservadas.

| Operação | Paleta solicitada |
| --- | --- |
| Kess | `#6D0D3F`, `#EC4899`, `#F9A8D4`, `#FCE7F3`, `#FFF9FB` |
| Primeiro Lar | `#4E8BC4`, `#97CBFB`, `#C2E1FD`, `#FFC2D9`, `#FF99BE`, `#FF6DA2` |

Texto escuro complementa as paletas, inclusive nos botões azuis e rosas, para manter contraste. Primeiro Lar usa superfícies claras e destaques rosas, sem gradientes adicionais. Componentes compartilhados herdam tokens, inclusive biblioteca e formulários.

## Banco e publicação

A migração incremental `20261121004446_kesia_dashboards.sql`, gerada pela CLI oficial (timestamp UTC), foi aplicada exclusivamente ao Supabase Dropou e registrada como `kesia_dashboards`. Não reaplicar a cadeia histórica. O SQL acrescenta o registro das duas operações, seus padrões desativados, os CHECKs e as listas das funções existentes. Não cria tabelas paralelas nem novos privilégios. As funções permanecem invoker e conservam seus grants. A instalação transacional comparou configurações e vínculos anteriores para abortar se fossem modificados.

RLS existente e a associação `operation_members` continuam sendo a autoridade; metadata editável não concede acesso. Escritas administrativas permanecem no servidor. `dropou_assign_member` associa a conta como integrante. O utilitário local `scripts/provision-member-workspaces.ts` recebe identidade e senha por stdin privado, protege proprietários/administradores, preserva marcas anteriores e não redefine a senha de contas existentes. Reserva uma execução sem retry automático e grava somente resultados booleanos em `outputs/` ignorado.

Telegram manual e agendado reutiliza o executor e o cron único `dropou-telegram-dispatch`. Configurar separadamente os tokens de servidor `TELEGRAM_KESS_BOT_TOKEN` e `TELEGRAM_PRIMEIRO_LAR_BOT_TOKEN`, o canal correspondente e sua verificação administrativa. Os placeholders em `.env.example` não contêm valores. Nenhum destino ou token foi inventado, copiado das demais operações ou ativado nesta tarefa. Sem configuração, o sistema apresenta a indisponibilidade real. WhatsApp mantém o compartilhamento manual existente; copiar uma legenda não cria recibo.

Os dois painéis usam a conta afiliada Shopee já configurada no servidor. A importação mantém o link original e exige o `offerLink` retornado pela API central para preparar uma oferta. Links comuns e links de outra conta sem evidência na mesma operação são bloqueados, inclusive por acesso direto às RPCs.

## Validação executada e limites

- Suíte completa: **555/555** testes aprovados; inclui isolamento entre as duas operações, RLS com atores distintos, revisão de afiliado, busca/cache, destinos separados e agendamento simulado dos dois novos painéis com automações pausadas. Depois do último ajuste do estado dos filtros, **22/22** testes direcionados passaram. Typecheck e build de produção finais aprovados. O projeto não possui comando lint.
- A migração completa foi testada em PGlite, incluindo replay e preservação das configurações antigas. Isso é teste local, não envio real.
- Supabase remoto: migração registrada uma vez; RLS das tabelas operacionais ativo; RPC de escrita de lote indisponível para authenticated; um cron existente; zero jobs dos novos painéis. Leitura sob papel authenticated e transação read only confirmou duas configurações visíveis, `admin=false`, e zero dados de operações não autorizadas mesmo com header `all`.
- Auth real: criação, login por senha, refresh, escopo exato e logout local confirmados. Endpoints Next locais com essa sessão: dez GETs autorizados 200 (dashboard, curadoria, salvos, agenda, publicações em cada painel), três escopos recusados 403 e API sem sessão 401. Uma primeira tentativa do servidor sob sandbox retornou 503 por rede indisponível; repetição no servidor conectado passou.
- Chrome instalado, com APIs interceptadas e sessão fictícia: **48 layouts** (seis telas × duas operações × 320/375/768/1440 px), sem overflow, imagens quebradas, erros de página ou acesso externo. Capturas desktop/celular inspecionadas. Isso não comprova a interface de produção ou um envio real.
- Advisors de segurança antes/depois: somente o aviso preexistente de [proteção contra senhas vazadas](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection), sem novos avisos.
- A consulta real adicional foi inicialmente recusada pela revisão automática antes da execução. Após autorização específica do usuário, uma única requisição autenticada e contabilizada retornou os dois produtos consultados, com fotos e links de afiliado válidos. Nenhum produto foi salvo e nenhuma mensagem foi enviada. O marcador privado impede repetir a consulta automaticamente.
- Nenhuma mensagem real, geração paga, mudança de credenciais alheias ou ativação de rotina. O usuário autorizou o envio ao GitHub e a publicação no Vercel. Os quatro commits remotos até `22ce169` foram integrados sem sobrescrever as melhorias de agendamento, a ponte Mercado Livre ou a lixeira animada. A confirmação de SHA/deploy será registrada na entrega.
- Auditoria inicial dos 567 arquivos versionáveis (rastreados e novos): zero correspondências de credenciais privadas locais e zero arquivos privados; `git diff --check` aprovado.

## Arquivos principais

| Área | Arquivos |
| --- | --- |
| Operações, modelos, legendas e capacidades | `src/lib/workspace-brands.ts`, `domain.ts`, `ai.ts`, `operation-capabilities.ts`; `src/server/general-dashboard.ts` |
| Curadoria e filtros | `src/lib/member-curation.ts`, `member-curation-view.ts`; `src/components/member-curation-filters.tsx`, `product-operations.tsx`; `src/app/api/product-operations/route.ts` |
| Navegação, catálogo e biblioteca | `src/components/team-settings.tsx`, `catalog-parts.tsx`, `shopee-saved-products.tsx` |
| Tema | `src/app/kesia-workspaces.css`, `member-workspaces.css`, `layout.tsx` |
| Auth administrativo local | `scripts/provision-member-workspaces.ts`, `scripts/lib/private-input.ts` |
| Banco, cron e configuração | `supabase/migrations/20261121004446_kesia_dashboards.sql`, `src/app/api/cron/route.ts`, `.env.example` |
| Regressões | `tests/kesia-dashboards.test.ts`, `karen-telegram.test.ts`, `channel-expansion.test.ts`, `member-dashboards.test.ts`, `redesign-ui.test.ts` |

Evidências locais seguras, capturas e relatórios estão em `outputs/`, excluído do Git. Não publicar esse diretório nem perfis de navegador.

## Integração e publicação autorizadas

Após autorização expressa, uma única consulta real à Shopee retornou dois produtos, duas fotos e dois links afiliados válidos da integração central. A requisição foi reservada e contabilizada no orçamento existente, sem criar produtos/ofertas/jobs ou mensagens. Não repetir o marcador privado de verificação.

A base remota avançou de `c9ae248` para `22ce169` durante o desenvolvimento. Os quatro commits novos foram preservados; conflitos somente em documentação anexada e imports de CSS foram resolvidos mantendo ambos os conteúdos. Na árvore integrada, **599/599 testes**, typecheck e build de produção passaram. A publicação usa o fluxo GitHub/Vercel existente, sem deploy manual duplicado. Os 48 layouts com APIs fictícias pertencem à inspeção visual descrita acima; a confirmação de disponibilidade em produção usa apenas GET.

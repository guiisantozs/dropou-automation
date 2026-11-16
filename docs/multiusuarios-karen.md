# Integrantes e dashboards da Karen

Implementação na branch `codex/karen-dashboards`, baseada na main `08f9044`. Não há deploy, push ou aplicação remota automática nesta entrega.

## Arquitetura encontrada e reaproveitada

O Dropou já utiliza Supabase Auth, `operation_members`, cadastro `affiliate_operations`, configurações `operation_settings`, dados com `owner_id`/`brand_id` e RLS. `sessionDb` verifica o usuário, resolve a equipe e consulta recursos pelo cliente sujeito a RLS antes de usar privilégios administrativos. Os helpers privados de equipe já distinguem proprietário, administrador e integrante, e administradores acessam todas as marcas do cadastro. Não foi criado outro sistema de login nem outra estrutura de produtos.

`operation_members.role='operator'` é apresentado como **Integrante**. O perfil administrativo existente permanece intacto. O nome de apresentação é opcional na associação; a saudação usa o primeiro nome dessa associação ou os dados de apresentação do Supabase Auth. Nomes e `user_metadata` nunca concedem permissões.

As nove operações e o consolidado compartilham `GeneralDashboard`, `ProductOperations`, sidebar, cabeçalho, edição, histórico e estados vazios existentes. A seleção após login mostra somente os dashboards autorizados. A URL mantém a operação/tela; atualizar não troca o dashboard. Enquanto o acesso ainda está sendo conferido, os componentes privados não são montados. Uma seleção herdada de outra conta é substituída por uma autorizada.

## Novas marcas

| ID interno | Nome | Escopo |
| --- | --- | --- |
| `beleza` | Toque de Beleza | Maquiagem, skincare, perfumes, cabelo e autocuidado |
| `casa` | Cantinho & Charme | Decoração, organização, cozinha, iluminação, móveis e utilidades |
| `natal` | Clima de Natal | Árvores, luzes, guirlandas, enfeites e decoração natalina |

As paletas fornecidas foram centralizadas em `member-workspaces.css`. Beleza usa Mahogany/Raspberry/Berry com Petal/Snow; Casa usa os pastéis, creme, azul e lavanda; Natal usa verde/vermelho/creme/marrom. Tons neutros auxiliares garantem leitura. Nenhuma paleta existente em `operation-theme.css` foi alterada. Os cards de seleção e componentes internos herdam os mesmos tokens.

Novas marcas começam **sem produtos, publicações ou métricas fabricadas**. O catálogo manual compartilha a tabela `products`, com busca, filtros, aprovação/rejeição, estados publicados/rejeitados/arquivados e paginação. As decisões reaproveitam a RPC de curadoria; não iniciam busca Shopee. Edição e legendas locais usam os mesmos fluxos de produtos/ofertas.

Histórico e agenda reutilizam as estruturas existentes, mas integrações e criação de envios/agendamentos permanecem indisponíveis nestas três marcas. A configuração é exibida com esse estado explícito. Não há bots, destinos, webhooks ou rotinas novas. O bloqueio também existe no servidor e no banco, inclusive para chamadas manuais e para o administrador.

## Migração e aplicação controlada

Arquivo gerado pela CLI oficial:

`supabase/migrations/20261116192906_karen_dashboards_membership.sql`

A migração é incremental e foi executada/reexecutada no PGlite:

- Insere apenas as três marcas e suas configurações vazias/desativadas para os proprietários existentes. Não renomeia marcas antigas, altera produtos ou substitui destinos existentes.
- Acrescenta `display_name` opcional a `operation_members`. As associações existentes são mantidas.
- Substitui a lista estática de marcas da associação por validação contra o cadastro, permitindo futuras marcas sem liberar automaticamente integrantes.
- Mantém os helpers/RLS existentes. O contexto acrescenta somente o nome de apresentação; o administrador continua recebendo todas as marcas registradas.
- Acrescenta a RPC administrativa transacional `dropou_assign_member`, executável somente por `service_role`, com verificação do administrador, propriedade da equipe e proteção contra reassociação concorrente a outra equipe.
- Acrescenta `dropou_local_products`, **security invoker**, usando as tabelas/views e políticas existentes. A identidade do proprietário é resolvida pelo helper da sessão, nunca por um UUID recebido do navegador.
- Impede configurações ativas/destinos e jobs para as três marcas nesta etapa. Não altera dispatcher, cron ou transporte dos canais atuais.

**O banco remoto não foi modificado.** A leitura remota anterior à implementação confirmou seis marcas e zero associações em `operation_members`. Isso não identifica uma conta Auth da Karen nem autoriza associá-la pelo nome.

Para disponibilizar esta versão, o administrador deve executar **somente este arquivo incremental** no projeto Supabase Dropou existente, por aplicação individual de migração ou pelo SQL Editor, e registrar a aplicação no processo de migrations da equipe. Não executar schema inicial, seeds, migrations antigas ou `db push` indiscriminado: o histórico remoto anterior possui versões diferentes dos timestamps locais. A migração deve anteceder a implantação desta versão do app. Conferir advisors/grants e executar os testes de autorização no ambiente de destino após aplicá-la. Nenhuma credencial nova é necessária no frontend.

## Como vincular Karen

1. Identifique o **e-mail real** da conta da Karen no Supabase Auth. Se ainda não existir, crie/convide a conta pelo fluxo administrativo oficial e deixe Karen definir suas credenciais. Nenhuma conta, convite, senha ou token foi criado por esta implementação.
2. Entre no Dropou como administrador, em **Configurações → Equipe e acesso aos dashboards**.
3. Clique **Preparar acesso da Karen**. O formulário seleciona o perfil Integrante e somente `beleza`, `casa` e `natal`; não grava nada nesse clique.
4. Informe o e-mail exato da conta Auth e clique **Salvar acesso**. O servidor localiza a conta existente, valida o administrador e faz a associação transacional à equipe atual. Não altera a conta Auth ou a senha.
5. Karen deve entrar com a própria conta. A saudação usa o horário local do navegador e os três cards autorizados. A suspensão em Equipe passa a valer na próxima consulta autenticada, sem depender de um papel antigo no JWT.

**Pendente externo:** o e-mail da Karen não foi informado; nenhum usuário real foi associado. O botão de preparação e o processo de vínculo estão prontos. Não compartilhar a conta do administrador e não associar contas apenas pelo nome “Karen”.

Para outro integrante, use o mesmo formulário, selecione suas marcas explicitamente e salve. Para administrador, o perfil inclui todas as marcas atuais e futuras registradas. Cada nova marca também precisa de sua configuração visual/capacidades no código da aplicação; cadastrar um ID desconhecido no banco não cria sozinho uma nova interface.

## Autorização no backend

`sessionDb` continua validando Auth e o contexto atual de associação a cada requisição. URLs com uma marca não autorizada são recusadas. Recursos de outra marca são consultados pelo cliente RLS antes de qualquer escrita privilegiada. Para integrantes, `brand=all` só é aceito nos GETs de metadados de acesso/equipe usados pela navegação; não oferece acesso ao consolidado ou a ferramentas globais. Integrações globais exigem administrador também nos GETs. Integrantes continuam operando seus canais anteriormente autorizados.

As APIs de equipe exigem administrador e `publicationAdmin`; o frontend não recebe `service_role`. A RPC de associação não permite promover o próprio proprietário por uma associação, mover uma conta de outra equipe ou ser chamada por `authenticated`/`anon`. As permissões não dependem de ocultação dos botões.

Referência consultada: [RLS do Supabase](https://supabase.com/docs/guides/database/postgres/row-level-security). A revisão usa grants mínimos, funções invoker para consultas e helpers privados existentes para identidade.

## Arquivos principais

| Área | Arquivos |
| --- | --- |
| Marcas, categorias e texto | `src/lib/workspace-brands.ts`, `domain.ts`, `ai.ts` |
| Perfis e permissão | `src/lib/dashboard-access.ts`, `operator-access.ts`, `src/server/session.ts`, rotas `api/team` e `api/operations` |
| Seleção e navegação | `src/components/dashboard-chooser.tsx`, `dashboard.tsx`, `brand-selector.tsx`, `workspace-sidebar.tsx`, `team-settings.tsx` |
| Apresentação | `src/app/member-workspaces.css`, `layout.tsx` |
| Catálogo compartilhado | `src/components/product-operations.tsx`, `product-form.tsx`, `src/server/local-products.ts`, `general-dashboard.ts`, rota `api/product-operations` |
| Integrações desativadas | `src/server/session.ts`, `src/lib/operator-access.ts`, rotas `api/operations` e `api/publication-config`, constraints da migração |
| Banco | `supabase/migrations/20261116192906_karen_dashboards_membership.sql` |
| Testes | `tests/member-dashboards.test.ts`, ajustes dos fixtures em `channel-expansion`, `operation-dashboard`, `redesign-ui`, `scheduling-workspace-db` |
| Navegador | `scripts/check-member-dashboards.ts`, `scripts/fixtures/member-auth-fixture.mjs` |

## Verificação e limites

- Suíte completa: **342/342**. Após a revisão final da consulta de catálogo, mais **8/8** testes direcionados de banco/perfil passaram. Tipos e build de produção aprovados. Não existe script `lint` neste repositório; não foi alegada execução de um lint inexistente.
- Banco PGlite: marcas inicialmente vazias; replay da migração; ofertas nas novas marcas; isolamento de produtos, configurações e catálogo; administrador atual/futuro; integrante anterior; associação; suspensão; tentativas de promover papel, trocar proprietário e ativar integração; acesso anônimo recusado.
- Next compilado/Chrome: **16 layouts** (seleção e três dashboards × 320/375/768/1440 px), recarregamento, seleção, catálogo/rejeitados, perfis e teclado. Capturas desktop/celular inspecionadas. Zero overflow, erros de página ou conexão externa.
- Endpoints reais do Next local: nove requisições indevidas recusadas com **403**, metadados autorizados com **200**, sem sessão com **401**. Auth é simulado apenas no processo de QA; a verificação RLS usa o banco local real. Isso não comprova uma sessão produtiva real da Karen.
- Regressão das abas atuais: **88 layouts** aprovados, com filtros, decisões, cópia, histórico, configurações e agenda simulados. Nenhuma postagem como teste.

O fixture de Auth só pode ser pré-carregado com `DROPOU_LOCAL_AUTH_FIXTURE=1` e a URL fictícia `https://dropou-preview.supabase.co`; ele bloqueia qualquer fetch externo e não é importado pela aplicação. O roteiro de navegador requer Chrome/Playwright locais e o Next iniciado explicitamente com esse preload. Evidências e logs estão em `outputs/`, ignorados pelo Git.

Nenhuma mensagem, consulta real de produto, geração paga, criação de conta, aplicação remota de migração, mudança de credenciais, ativação, push ou deploy foi realizada nesta implementação. A main publicada e o experimento Mercado Livre foram preservados.

Prévia local de capturas: http://127.0.0.1:4200, com seleção de marca e celular/desktop. O perfil mostrado é simulado e os botões na imagem não executam ações. A revisão final de banco também manteve uma configuração antiga ativa com seus destinos, além das três novas configurações pausadas.

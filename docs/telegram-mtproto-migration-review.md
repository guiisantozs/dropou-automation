# Parecer da migração Telegram MTProto

## Aplicação autorizada concluída

- Projeto de produção confirmado: `wqpdyfipjsnyzxktacqh`. Aplicação em 16/11/2026 às 01:08 UTC (15/11 à noite no Brasil), exclusivamente desta migração, uma única execução do roteiro transacional `apply-definitive.sql`. Nenhum push geral, migração anterior ou deploy.
- Fonte SHA-256 `52f6c3a2679bdccfc65755f189a7184ae90085495c7aa53ea2f256f0a6c872b8`; roteiro SHA-256 `414768900f805573ba8ebfee4a1cf64d79db45adc88d2d42e52a94bf37112513`. Roteiro conferido integralmente com o gerador e com a fonte canônica antes da execução. Arquivo aplicado preservado sem alterações posteriores.
- Diagnóstico local remanescente encerrado; nenhum processo MTProto nem listener na porta 8081 antes da aplicação e do teste de lease. Worker normal e login não iniciados.
- Preflight remoto somente de leitura aprovado: dependências presentes, zero conflitos de relações/tipos/funções e ausência prévia da versão/nome no histórico.
- `docs/telegram-mtproto-postcheck.sql` executado. Verificação adicional confirmou três tabelas com RLS, zero políticas e zero acesso direto para anon/authenticated; SELECT/INSERT/UPDATE/DELETE para service_role. Três funções SECURITY INVOKER com search_path vazio, sem EXECUTE para clientes e com EXECUTE para service_role; hashes dos corpos iguais à fonte revisada. As duas proteções contra expiração NULL estão presentes.
- Histórico contém exatamente uma entrada de versão `20261115234052`, nome `telegram_mtproto_connections`, com o SQL canônico completo. As três tabelas estão vazias e disponíveis pela Data API: HTTP 200, consultas administrativas limitadas a zero registros.
- Lease aprovada: aquisição true, segunda aquisição false, liberação true. Mesmas três chamadas do roteiro preparado, com resultado agregado em uma única consulta para a CLI exibir os três valores, mantendo BEGIN/ROLE/timeouts/ROLLBACK. Variante validada primeiro em PGlite. Depois do rollback, zero leases, conexões ou diagnósticos permanentes.
- Contagens e hashes agregados das **46 tabelas públicas preexistentes** e hashes de definição das **117 funções anteriores** coincidiram antes/depois da aplicação e novamente após o teste. Nenhum conteúdo de registro foi retornado nos snapshots. Não houve restauração ou modificação de dados de negócio.
- Evidências locais ignoradas em `outputs/telegram-mtproto/migration-review/production-*.json`; incluem preflight, referência anterior/posterior, aplicação, postcheck, lease e Data API. Nenhuma credencial ou sessão nos relatórios.

**Estado atual: aplicada e verificada. Não executar novamente os comandos de aplicação apresentados no parecer histórico abaixo.** O banco está pronto para a próxima etapa de iniciar o worker e realizar o primeiro login com autorização. Nenhuma autenticação Telegram, mensagem, alteração de credenciais, push ou deploy nesta aplicação.

## Parecer anterior à aplicação (registro histórico)

**O arquivo original está corrigido e a versão definitiva está pronta para aplicação na próxima etapa, mediante autorização explícita de execução.** As duas proteções contra expiração nula da proposta aprovada foram incorporadas diretamente a `supabase/migrations/20261115234052_telegram_mtproto_connections.sql`. A comparação byte a byte confirmou que o arquivo corrigido é idêntico à proposta aprovada. Nenhum DDL/DML foi executado no Supabase nesta finalização.

As três tabelas, RLS, grants e funções foram preservados; somente duas condições SQL mudaram. A migração é incremental, não altera dados ou funções de negócio existentes e não apresentou conflitos de nomes ou histórico no projeto Dropou. O roteiro definitivo aplica somente essa migração, em uma transação.

## Projeto e evidências remotas somente de leitura

- Repositório confirmado: Dropou, branch `codex/celulares-intelligent-curation`, com alterações locais preexistentes preservadas.
- Projeto Supabase: **`wqpdyfipjsnyzxktacqh`**, ambiente de produção. Dashboard e worker usam esse mesmo host, conforme comparação das URLs locais sem imprimir credenciais.
- O conector MCP recusou as consultas por permissão. A CLI oficial **3.1.0** conseguiu consultar o mesmo projeto usando `db query --remote=... --read-only`. A revisão não depende de acesso de escrita do conector.
- Existem `auth.users(id uuid)`, `public.affiliate_operations(id text)`, suas chaves de referência, `gen_random_uuid()` e o histórico oficial de migrações.
- As roles `anon` e `authenticated` não têm `BYPASSRLS`; `service_role` tem, como esperado pelo backend.
- Nenhuma relação, tipo ou função com os prefixos MTProto foi encontrada. Não há registro da versão `20261115234052` nem do nome `telegram_mtproto_connections` no histórico.
- O histórico já contém `celulares_curation_shared_products` (`20261115183010`). Isso é um snapshot atual: não executar novamente essa ou outras migrações anteriores. Há versões antigas no histórico com timestamps diferentes dos arquivos locais; isso também impede recomendar um push geral do diretório.
- O arquivo `docs/telegram-mtproto-preflight.sql` foi novamente executado em uma transação somente de leitura nesta finalização, antes de editar a migração ainda não aplicada. Os arrays de conflitos ficaram vazios e todos os pré-requisitos retornaram verdadeiros, incluindo ausência da versão/nome no histórico remoto.

## Conteúdo completo do SQL

| Objeto | Finalidade e restrições |
| --- | --- |
| `telegram_mtproto_connections` | UUID da conexão; proprietário e marca; estados desconectado/código/senha/conectado/erro; sessão/desafio já criptografados pelo worker; expiração, tentativas entre 0 e 8 e cooldown; seleção de até dez fontes; início/fim do teste e heartbeat. Uma conexão por proprietário/marca. Conta e marca devem existir. |
| `telegram_mtproto_diagnostics` | Somente conexão/teste/canal, ID da mensagem, horários e tipo (`text/photo/document/other`). Chave composta impede duplicatas no mesmo teste. Não cria colunas para texto, telefone, senha, remetente ou arquivos. |
| `telegram_mtproto_worker_lease` | Uma linha singleton, com holder UUID e expiração, para impedir workers simultâneos. Não armazena credenciais. |

As chaves primárias e a unicidade proprietário/marca criam seus índices. O SQL também cria `telegram_mtproto_diagnostics_retention`, por `received_at`, para limpeza.

As referências apontam para `auth.users` e `affiliate_operations`. Excluir uma conta apaga somente suas conexões MTProto e os respectivos diagnósticos; excluir uma conexão apaga seus diagnósticos. Uma marca com conexões passará a ter mais uma referência que impede sua exclusão direta, assim como as outras referências da operação. Nenhum registro existente é excluído pela aplicação da migração.

### RLS e permissões

O SQL liga RLS nas três tabelas. **Não cria políticas `CREATE POLICY` para clientes**: anon/authenticated/PUBLIC perdem todos os privilégios e somente `service_role` recebe SELECT/INSERT/UPDATE/DELETE. As funções também têm EXECUTE revogado para anon/authenticated/PUBLIC e concedido somente a service_role. PostgreSQL/roles administrativas conservam seus poderes administrativos normais.

Isso não implementa uma política de leitura por proprietário no cliente. Como service_role contorna RLS, o isolamento proprietário/marca continua sendo responsabilidade da API autenticada e do worker, que já filtram o escopo. A chave privilegiada e o retorno interno com ciphertext nunca devem ser enviados ao frontend. O SQL armazena `encrypted_state`; a criptografia AES-GCM é feita no código, sem instalar extensões ou guardar a chave no banco. Esse comportamento de RLS e de service_role é descrito na [documentação do Supabase](https://supabase.com/docs/guides/database/postgres/row-level-security).

### Funções

- `dropou_mtproto_lease(uuid, boolean)`: adquire/renova a reserva por 30 segundos se livre, expirada ou do mesmo holder; o segundo parâmetro libera somente a reserva do próprio holder. A aquisição é atômica por `ON CONFLICT`.
- `dropou_mtproto_update(uuid, uuid, jsonb)`: exige lease ativa do holder, bloqueia a conexão durante a escrita, ignora tentativas de trocar id/proprietário/marca no patch e atualiza somente os campos previstos. Retorna o registro interno, incluindo ciphertext, somente ao backend.
- `dropou_mtproto_diagnostic(uuid, uuid, timestamptz, text, bigint, timestamptz, text)`: exige lease válida, conexão conectada, canal/teste corretos, janela válida e mensagem nova. Insere metadados idempotentes; retém no máximo 50 por conexão e remove vencidos de uma hora durante a ingestão. A limpeza periódica adicional é do worker; a migração não cria cron.

Todas são **SECURITY INVOKER**, com `search_path` vazio e referências qualificadas. Não concedem uma elevação de privilégio a clientes. A ordem de locks usada pelas duas funções de escrita é lease → conexão, evitando inverter esses dois locks.

## Defeito corrigido

O `CHECK` anterior exigia início não nulo, mas não exigia `test_expires_at` não nulo. Comparações com NULL podiam deixar o resultado do CHECK desconhecido, aceito pelo PostgreSQL, conforme a [documentação de constraints](https://www.postgresql.org/docs/current/ddl-constraints.html). A RPC comparava apenas `c.test_expires_at <= clock_timestamp()`, sem rejeitar explicitamente NULL.

**Reprodução na revisão anterior:** no PGlite descartável, uma conexão sintética conectada, com início uma hora no passado e expiração NULL, era aceita; a RPC gravava um evento. Esse caminho exigia escrita privilegiada. Os testes atuais usam o arquivo original já corrigido e exigem a recusa desse estado, sem gravar diagnóstico.

A correção aprovada altera exatamente duas condições:

```sql
-- Acrescentar no CHECK da janela:
and test_expires_at is not null

-- Acrescentar na condição de recusa da função de diagnóstico:
or c.test_expires_at is null
```

Com um canal de teste definido, a constraint agora exige estado conectado, início e fim não nulos e uma duração positiva de no máximo dez minutos. O `IS NOT NULL` faz a condição retornar falso para fim nulo, em vez de depender de uma comparação desconhecida. Sem teste ativo, os campos continuam podendo ser nulos. A RPC também rejeita fim nulo independentemente da constraint.

Arquivos definitivos preparados, ainda sem aplicação:

- `supabase/migrations/20261115234052_telegram_mtproto_connections.sql`: fonte definitiva corrigida, originalmente gerada pela CLI oficial e ainda não aplicada.
- `outputs/telegram-mtproto/migration-review/apply-definitive.sql`: somente a fonte definitiva, envolvida em transação com proteções e registro no histórico.
- `outputs/telegram-mtproto/migration-review/lease-rollback.sql`: teste futuro da reserva, com rollback.

O gerador `scripts/prepare-telegram-mtproto-migration.mjs` lê diretamente o arquivo original corrigido e exige seu hash revisado; não deriva uma versão alternativa. Apenas prepara arquivos locais, sem chamar CLI/rede nem executar SQL. Os artefatos ficam em `outputs`, ignorado pelo Git. Os antigos roteiros `apply-proposed.sql`/`apply-reviewed.sql` são retirados pelo gerador para evitar confusão. A proposta usada na comparação permanece somente como evidência local. Regenerar:

```powershell
node scripts/prepare-telegram-mtproto-migration.mjs
```

Hashes SHA-256 para revisão:

| Arquivo | Hash |
| --- | --- |
| Versão anterior, apenas referência histórica | `c0d2c96df801c8403976b4246e2e742629cbc35c1b24a133afd8b5865f403039` |
| Arquivo original corrigido = proposta aprovada | `52f6c3a2679bdccfc65755f189a7184ae90085495c7aa53ea2f256f0a6c872b8` |

## Impacto e riscos de aplicação

1. **Nenhuma alteração dos fluxos atuais:** não há ALTER/DROP das tabelas de produtos/ofertas/filas/recibos/configuração, alteração de funções existentes, inclusão de mensagens, ativação de rotinas ou modificação de destinos, Bot API, Shopee ou WhatsApp. As novas funções só fazem trabalho quando chamadas. A migração não autentica Telegram.
2. **Locks curtos:** criar FKs obtém locks nas tabelas pai existentes; uma aplicação pode disputar acesso concorrente, embora as tabelas novas estejam vazias. O roteiro impõe `lock_timeout=5s` e `statement_timeout=60s`; timeout aborta e desfaz a transação.
3. **Não reaplicar automaticamente:** o SQL usa CREATE, sem IF NOT EXISTS, e não é idempotente para uma segunda aplicação. O roteiro recusa qualquer objeto MTProto parcial ou histórico já existente. Não deve substituir objetos nem ocultar uma aplicação parcial.
4. **Aplicar em uma transação:** o original não contém BEGIN/COMMIT explícitos. O arquivo preparado envolve DDL, revogações/grants e histórico em uma única transação, evitando objetos parciais e exposição intermediária de permissões. Falha desfaz tudo. A notificação de recarga do schema só é entregue ao confirmar.
5. **Depois do commit:** o histórico e os objetos já podem existir mesmo que uma conexão caia antes da confirmação ao cliente. Consultar preflight/histórico antes de qualquer nova tentativa; não repetir automaticamente nem fazer repair do histórico sem verificar o schema.
6. **Rollback posterior não é a mesma coisa:** antes do COMMIT, rollback desfaz tudo; depois de sessões reais existirem, remover as novas tabelas destruiria essas sessões/metadados e exigiria outro plano. Não foi preparado um DROP CASCADE automático.

## Comandos preparados para a etapa autorizada

**A incorporação local foi autorizada e concluída. Nenhum comando de aplicação remota foi executado; a execução continua aguardando autorização.** A chave Supabase do `.env.local` é para a API de dados; não é a senha Postgres nem o token de gerenciamento da CLI. Não colocar nenhuma dessas credenciais nos argumentos, scripts ou logs. A consulta desta revisão funcionou com o perfil autenticado já existente da CLI.

Usar a CLI 3.1.0 consultada nesta revisão. A aplicação também exigirá permissão de escrita no perfil de gerenciamento; consultas `--read-only` não comprovam essa permissão:

```powershell
$mtprotoCli = Join-Path (Get-Location) '.npm-cache/_npx/aa8e5c70f9d8d161/node_modules/@supabase/cli-windows-x64/bin/supabase.exe'
& $mtprotoCli --version
& $mtprotoCli db query --remote=wqpdyfipjsnyzxktacqh --read-only --file docs/telegram-mtproto-preflight.sql
```

O preflight deve mostrar todos os pré-requisitos presentes e todos os arrays de conflito vazios. O comando escolhe explicitamente o projeto, sem depender do vínculo local. A CLI v3 é local por padrão e exige alvo remoto explícito, conforme seu `--help` e [referência oficial](https://supabase.com/docs/reference/cli/supabase-db-query).

Preparação local já executada, sem aplicação de SQL:

```powershell
node scripts/prepare-telegram-mtproto-migration.mjs
Get-FileHash -LiteralPath supabase/migrations/20261115234052_telegram_mtproto_connections.sql -Algorithm SHA256
```

O hash deve ser o definitivo acima. Se o arquivo for alterado novamente, o gerador recusa a preparação até uma nova revisão explícita. Não é necessário copiar a proposta ou editar o hash para esta versão.

**Somente após autorização da aplicação**, com o worker normal parado e conferindo o alvo de produção:

```powershell
& $mtprotoCli db query --remote=wqpdyfipjsnyzxktacqh --file outputs/telegram-mtproto/migration-review/apply-definitive.sql
```

O arquivo preparado aplica somente a migração MTProto corrigida. Usa lock transacional, verifica novamente dependências/objetos/histórico, cria os objetos e registra versão/nome/SQL no histórico oficial na mesma transação. Inclui `NOTIFY pgrst, 'reload schema'`, conforme a [orientação oficial de recarga](https://supabase.com/kb/troubleshooting/refresh-postgrest-schema). Não usar db push geral, migration up geral, schema inicial ou seeds. Não passar `--yes` antes da autorização. Se a CLI pedir confirmação do alvo remoto, conferir o projeto antes de confirmar.

## Verificação após uma aplicação autorizada

```powershell
& $mtprotoCli db query --remote=wqpdyfipjsnyzxktacqh --read-only --file docs/telegram-mtproto-postcheck.sql
```

Resultados esperados: três tabelas com RLS ligado, zero políticas para clientes, nenhum SELECT/INSERT/UPDATE/DELETE para anon/authenticated; quatro privilégios de tabela para service_role; três funções invoker com search_path vazio, sem EXECUTE para clientes e com EXECUTE para service_role; índices/constraints novos e uma linha de histórico da migração. A última consulta deve retornar `active_test_requires_expiration=true` e `diagnostic_rejects_null_expiration=true`, além da presença de `test_expires_at IS NOT NULL` na definição da constraint.

Teste operacional de lease, **ainda sem login e com worker normal parado**, somente depois da aplicação aprovada:

```powershell
& $mtprotoCli db query --remote=wqpdyfipjsnyzxktacqh --file outputs/telegram-mtproto/migration-review/lease-rollback.sql
```

Deve retornar primeira aquisição true, segunda false e liberação true. O ROLLBACK deixa zero alterações permanentes; o teste não cria conta, conexão MTProto, diagnóstico, sessão ou mensagem. Se uma lease real estiver ocupada, interromper e verificar o worker; não forçar uma nova reserva.

Depois, checar as três tabelas pela Data API com a chave privilegiada somente no servidor e consultas limitadas a zero registros. A recarga da API pode levar algum tempo; uma resposta temporária PGRST205 não autoriza reaplicar a migração. Clientes anon/authenticated devem continuar sem acesso direto. O diagnóstico HTTP local pode ser testado separadamente; iniciar o worker normal e fazer login real são etapas posteriores e não fazem parte desta revisão.

## Testes locais da revisão

Os testes usam somente PGlite descartável, sem Supabase remoto, e executam o arquivo original corrigido. Recusam inserção, atualização direta e patch via RPC com expiração nula; verificam início nulo, duração não positiva e acima de dez minutos, além de aceitar a janela exata de dez minutos e o encerramento com campos nulos. Para testar a defesa independente da RPC, apenas no banco descartável um teste remove a constraint da janela e injeta estado malformado: a RPC retorna false e não grava metadados.

Também exercitam a transação/histórico, simulam erro após DDL para provar rollback integral, recusam reaplicação e colisões, executam o smoke de lease com rollback e aplicam o SQL definitivo depois de todas as migrações anteriores. Os testes existentes de grants/RLS, lease e diagnósticos permanecem cobrindo a mesma fonte canônica.

Nesse último ensaio, hashes dos dados de todas as tabelas públicas preexistentes e das definições das funções antigas foram iguais antes/depois. Isso não substitui a conferência remota pós-aplicação: os event triggers nativos do Supabase, por exemplo, não são reproduzidos pelo PGlite.

Resultado da finalização: **11/11 testes SQL direcionados** e **364/364 testes completos** aprovados. `npm.cmd run typecheck`, `npm.cmd run build` e `git diff --check` também passaram. A auditoria dos dez arquivos de migração, preparação e documentação encontrou zero correspondências dos segredos privados locais, sem imprimir seus valores. O ambiente e os artefatos de `outputs` continuam ignorados pelo Git. Detalhes em `VALIDACAO.md`; logs locais em `outputs/telegram-mtproto/migration-review/final-*.log`.

Comando local para repetir os testes específicos:

```powershell
node_modules/.bin/tsx.cmd --test tests/telegram-mtproto-migration-review.test.ts tests/telegram-mtproto-db.test.ts
```

**Parecer final:** arquivo original corrigido, com as duas proteções contra NULL, e roteiro definitivo preparado para a próxima etapa autorizada. Sem alteração de credenciais, dados existentes, banco remoto, deploy ou autenticação Telegram nesta finalização. A autorização desta etapa permite correção e validação locais; não autoriza a aplicação em produção.

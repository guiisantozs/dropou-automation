# Fila persistente MTProto — aplicação interrompida no preflight

Em 16/11/2026, a aplicação autorizada foi interrompida **antes de executar a migração**, por divergência de permissões. Projeto `wqpdyfipjsnyzxktacqh`; versão `20261116025405`. Arquivo original preservado com SHA-256 `8707d45cc9fddd928d9e75ac4d69ee6f4e74b3b0d562706a03a34884ed3dfc98`.

## Verificações aprovadas

- Projeto da CLI e URL do ambiente correspondem ao Dropou autorizado. Branch local `codex/celulares-intelligent-curation`; alterações anteriores preservadas.
- Hash coincide exatamente com a autorização. Migração ainda ausente no histórico; nenhum conflito de nomes de relações ou funções.
- Worker anterior encerrado por Ctrl+C e confirmação do terminal Windows. Porta 8081 fechada; lease remota inativa. Worker não reiniciado.
- Nenhuma janela de diagnóstico ativa, nenhuma reserva Shopee `reserved`, nenhuma importação com lease ativa e nenhuma chamada de orçamento ativa na leitura do preflight.
- `telegram-mirror-preflight.sql` executado somente por leitura. As duas funções de orçamento conservam assinaturas e hashes das definições revisadas: `dropou_shopee_reserve` → `3786f1509022b68e3f5c63a0c5afee99`; `dropou_shopee_reserve_v2` → `b373bb2eb6677199588ccdfefc8cabe9` (MD5 de `pg_get_functiondef`). Constraint atual de finalidade permanece `search/revalidate/manual`.

## Impedimento confirmado

As permissões padrão de tabelas no schema `public`, tanto para objetos criados por `postgres` quanto por `supabase_admin`, concedem todos os privilégios a `service_role`. O SQL autorizado revoga privilégios de `public`, `anon` e `authenticated`, mas não os revoga de `service_role`. Os GRANTs restritos seguintes acrescentam permissões; não removem as herdadas na criação.

Reprodução somente em PGlite, com a cadeia de migrações e o mesmo grant padrão antes da migração da fila, confirmou:

| Tabela | UPDATE pelo servidor | DELETE pelo servidor | TRUNCATE pelo servidor |
| --- | --- | --- | --- |
| `mirror_budget_limits` | Permitido indevidamente | Permitido indevidamente | Permitido indevidamente |
| `mirror_offer_events` | Permitido indevidamente | Permitido indevidamente | Permitido indevidamente |
| `mirror_channel_policies` | Permitido como esperado | Permissão excedente | Permissão excedente |
| `mirror_offers` | Permitido como esperado | Permissão excedente | Permissão excedente |

As restrições de escrita do navegador continuaram válidas na reprodução. O problema é o excesso de privilégios do servidor: contraria o histórico sem atualização/exclusão e os tetos globais somente para leitura. O postcheck autorizado reprovaria `server_delete` nas quatro tabelas.

A suíte anterior de 394 testes não reproduzia esses grants padrão do Supabase. Essa lacuna da fixture explica por que o problema não apareceu na validação local anterior.

## Correção necessária, ainda não executada

Revogar os privilégios iniciais de `service_role` nas quatro tabelas novas antes de conceder somente os acessos necessários, sem alterar permissões padrão globais ou outras tabelas. Acrescentar regressão local com os grants reais do Supabase. Depois, repetir validação, gerar novo hash e submeter a versão corrigida à autorização; a autorização atual fixa o hash anterior e manda interromper em divergência.

## Estado final

Nenhum roteiro de aplicação foi executado. As quatro tabelas, funções, triggers e índices novos continuam ausentes. Não houve registro novo no histórico, alteração dos limites de consumo ou alteração das funções existentes. O postcheck não foi executado porque depende da aplicação. Nenhum deploy, consulta real à Shopee, publicação, diagnóstico novo ou autenticação foi realizado.

Não houve modificação de registros existentes pela migração. O encerramento autorizado do worker encerrou a lease operacional. Ele permanece parado. **Ainda não está liberado iniciar o teste real de persistência:** é necessário corrigir e revalidar a proposta antes de autorizar sua aplicação.

Evidências locais ignoradas pelo Git: `outputs/telegram-mtproto/persistent-review/authorized-preflight.json` e `default-acls-reproduction.json`. Não contêm credenciais, sessões, conteúdo de mensagens ou links afiliados.

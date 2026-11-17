# Bots Telegram das operações Karen

Implementação local em 16/11/2026, baseada na `main` limpa `cdc4417`. A conexão dos bots reais depende da instalação da migração, das variáveis privadas no servidor e da configuração de cada canal. Nenhuma mensagem real, migração remota, push ou deploy foi executado nesta etapa.

## Variáveis privadas

| Operação | Canal | Variável do bot exclusivo |
| --- | --- | --- |
| `beleza` | Toque de Beleza | `TELEGRAM_BELEZA_BOT_TOKEN` |
| `casa` | Cantinho & Charme | `TELEGRAM_CASA_BOT_TOKEN` |
| `natal` | Clima de Natal | `TELEGRAM_NATAL_BOT_TOKEN` |

Preencher os valores somente no ambiente privado do servidor (`.env.local` ignorado no desenvolvimento; variáveis privadas da Vercel no futuro deploy). Não usar prefixo `NEXT_PUBLIC_`. O banco e a interface guardam apenas o nome da variável, nunca o token. Não trocar as variáveis dos bots antigos. A ausência do token exclusivo produz erro com o nome da variável pendente; não há fallback para o bot principal.

## Migração e ordem de instalação

Nova migração CLI: `supabase/migrations/20261117003706_karen_manual_telegram_bots.sql`. Foi validada localmente com a cadeia completa de migrações em PGlite. Continua **pendente de aplicação remota**. Não reaplicar schema, seeds ou migrações históricas.

Em uma etapa posterior autorizada: conferir o histórico do projeto Dropou, instalar somente a migração nova, preencher as três variáveis privadas e publicar a aplicação. Não fazer deploy deste código antes da migração: a configuração e o dispatcher dependem dos novos CHECKs e da RPC de agendamentos manuais. O arquivo anterior `20261116192906_karen_dashboards_membership.sql` e as demais migrações aplicadas permanecem intactos.

A migração amplia o enum textual de `telegram_bot_env`, atribui o bot correto somente às três marcas e valida esse vínculo em um CHECK. Um trigger aplica o padrão exclusivo em novas inserções de configurações; UPDATEs incompatíveis são recusados. As configurações das marcas antigas não recebem UPDATE.

`local_brands_integrations_off` passa a permitir o cadastro/verificação Telegram, preservando `automation_enabled=false`, `automatic_not_before=null`, WhatsApp sem destino e Shopee desabilitada/em simulação/com revisão. `local_brands_no_jobs` permite somente Telegram revisado, sem fallback sem preço e sem job de automação Shopee. Não há alteração de RLS ou criação de cron.

## Configurar e verificar cada canal

Repetir estes passos **individualmente nas três operações** com a conta administradora:

1. Adicionar o bot correspondente como administrador do canal, com permissão de postar mensagens.
2. Selecionar a operação no dashboard e abrir **Configurações**.
3. Informar o canal como `@username` ou ID `-100...`. Em **Bot deste canal**, a seleção fica restrita ao bot exclusivo da operação.
4. Clicar em **Salvar configurações**. Alterar canal ou bot invalida a verificação anterior. Salvar não envia mensagens.
5. Clicar em **Verificar conexão**. O servidor consulta somente `getMe`, `getChat` e `getChatMember`, exige um canal e permissão de postagem e registra o ID numérico/nome/data. Nenhuma mensagem é enviada.
6. Conferir o nome/ID retornado. Para um teste real deliberado, abrir **Enviar teste ao Telegram salvo** e clicar em **Confirmar e enviar uma mensagem de teste**. Essa ação envia uma mensagem ao canal salvo. Sem confirmação, UUID da solicitação e confirmação do destino verificado, a API recusa o teste das novas operações. Repetir o mesmo UUID não envia novamente.

Integrantes não podem editar configurações nem verificar/enviar testes administrativos. Podem revisar ofertas, publicar e agendar apenas nas operações associadas ao seu cadastro. A sessão, o cliente com RLS, `publicationAdmin` e a RPC que valida a integrante continuam exigidos. Bot, canal e proprietário não vêm do corpo da publicação: são resolvidos pela oferta e pela configuração persistida.

## Publicação e agendamento

Abrir uma oferta na operação correta, conferir produto, preço, foto/apresentação e legenda, e salvar a revisão quando necessário. **Publicar agora** confirma o envio ao destino exibido. Para agendar, ativar **Agendamento**, escolher data/hora em `America/Bahia` e clicar em **Agendar**. O payload precisa confirmar explicitamente o agendamento Telegram.

Os agendamentos confirmados das três marcas usam o **mesmo cron existente** e funcionam com as flags de automação pausadas. A autorização é o job individual associado a `queued_by`, não uma liberação da rotina. A RPC revalida acesso ativo da integrante, destino verificado, horário, snapshot/revisão, chave do destino e provas anteriores de entrega. Para impedir um envio agendado, cancelar o job na agenda. Alterar o token, o destino ou os dados da oferta exige nova confirmação; perder acesso impede a execução. Bots/destinos das outras operações e retomadas antigas conservam seu comportamento.

Recebimentos usam as tabelas/RPCs existentes de jobs, deliveries e eventos. A interface só mostra publicação confirmada após recibo Telegram. Entregas parciais/incertas não voltam à fila automaticamente. Salvar, verificar, copiar ou abrir o modal não registra publicação.

Espelhamento MTProto, configuração WhatsApp, publicação em lote envolvendo as três novas operações, rotinas Shopee automáticas e ativações genéricas continuam bloqueados. A busca/importação Shopee manual anteriormente autorizada permanece disponível. Nenhuma rotina foi ativada e nenhum cron Vercel foi criado.

## Arquivos da alteração

- Configuração privada: `.env.example` (somente nomes vazios).
- Capacidades/modelos: `src/lib/operation-capabilities.ts`, `operation-settings.ts`, `operator-access.ts`, `telegram-connection.ts`, `publication.ts`, `workspace-brands.ts`.
- Servidor Telegram: `src/server/telegram-operation-config.ts`, `telegram.ts`, `telegram-offer.ts`.
- APIs: `src/app/api/operations/route.ts`, `publication-config/route.ts`, `cron/route.ts`, `offers/[id]/schedule/route.ts`, `offers/[id]/channels/route.ts`.
- Interface: `src/components/operation-settings.tsx`, `dashboard.tsx`, `product-operations.tsx`, `quick-offer-modal.tsx`, `shopee-saved-products.tsx`.
- Banco: `supabase/migrations/20261117003706_karen_manual_telegram_bots.sql`.
- Regressões: `tests/karen-telegram.test.ts`, `member-dashboards.test.ts`, `member-shopee.test.ts`, `redesign-ui.test.ts`.
- Documentação: este guia, `AGENTS.md` e `VALIDACAO.md`.

`src/server/session.ts` foi inspecionado e preservado: já valida sessão, permissões administrativas e recurso por RLS antes de qualquer escrita privilegiada. Sua política de integração usa agora as capacidades atualizadas em `operator-access.ts`.

## Validação e limites

Suíte completa: **470/470**, incluindo os bots antigos. Novos testes PGlite/Telegram simulado validam os três destinos, token ausente, bot incompatível, canal inválido, ausência de permissão, verificação sem mensagens, confirmação de teste, autorização por integrante, execução de agendamento com flags false, troca de destino/chave, entrega incerta, restrições WhatsApp/fallback e grants/RLS. Typecheck e build de produção aprovados.

Chrome/Next compilado: **36 combinações** (configurações, publicar e agendar × três marcas × 320/375/768/1440 px). Fluxos administrativos de salvar/verificar/teste explícito e fluxos de integrante/publicação/agendamento/token ausente conferidos. APIs de navegador interceptadas, nenhuma rede externa, nenhum overflow horizontal ou erro de página. Capturas desktop/celular inspecionadas em `outputs/karen-telegram-review/screenshots/` (ignoradas). Três GETs locais sem sessão retornaram 401.

QA HTTP adicional em processo localhost isolado: **18 verificações** nas rotas Next reais, com Auth/Supabase/Telegram simulados e todas as demais saídas de rede recusadas. Confirmadas as recusas de configuração/verificação por integrante, acesso a operação/recurso não associado, bot adulterado, canal inválido, ativação de rotina, envio sem confirmação/chave, WhatsApp agendado e replay do UUID do teste. A verificação não chamou métodos de envio; o teste expressamente confirmado recebeu somente uma resposta simulada de `sendMessage` por rodada. Artefatos em `outputs/telegram-http-result.json` (ignorado), sem credenciais reais.

Auditoria local de arquivos versionáveis sem credenciais/artefatos privados; `git diff --check` aprovado. Estes testes não comprovam a conexão dos bots reais nem as permissões nos canais de produção. Essa verificação só poderá ocorrer após a instalação e a configuração privada descritas acima.

Referências: [Telegram Bot API](https://core.telegram.org/bots/api#getchatmember), [Supabase RLS](https://supabase.com/docs/guides/database/postgres/row-level-security). Changelog Supabase consultado antes da migração; CLI 3.1.0 usada apenas para gerar o arquivo local.


## 2026-11-16 · Instalação e publicação autorizadas

Pedido posterior autoriza envio ao GitHub e deploy Vercel. A migração 20261117003706_karen_manual_telegram_bots foi aplicada somente ao projeto Dropou e registrada atomicamente no histórico (SHA-256 do arquivo: 8238723f63bc55ac36a4eca804ccae6679a6062d8d5382a9699c6bce351e691f). Não reaplicar. Postcheck remoto: bots exclusivos corretos, três automações false, um cron existente, 44 jobs/43 deliveries/202 eventos/dois vínculos preservados. Nomes das três variáveis privadas confirmados em Production na Vercel, sem baixar valores. As senhas e os dois logins foram validados na etapa anterior e não foram repetidos para deploy. A recuperação de e-mail depende de URL/SMTP compatíveis; a configuração Auth remota não foi alterada nesta publicação. SHA Git e estado efetivo do deploy são conferidos no relatório final.

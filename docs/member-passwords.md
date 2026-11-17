# Senhas iniciais e recuperação de conta

Implementação local, preservando a main `cdc4417` e as alterações de Telegram já em andamento. Sem deploy ou migração de banco nesta tarefa.

## Troca administrativa local

Executar na raiz do projeto, diretamente em um terminal local:

```powershell
npm.cmd run members:passwords
```

O script não aceita argumentos, entrada redirecionada, CI ou execução Vercel. Usa `SUPABASE_SECRET_KEY` ou `SUPABASE_SERVICE_ROLE_KEY`, carregada do ambiente local ignorado, e exige o projeto Dropou existente. Nenhuma chave administrativa é enviada ao frontend ou gravada em código/relatórios.

1. Para cada uma das **duas contas existentes**, informar o e-mail exato e confirmar o ID copiado de Supabase → Authentication → Users. A busca paginada usa `auth.admin.listUsers()` e confirma novamente com `getUserById()`. Não usa createUser/inviteUser nem cria contas.
2. O script recusa o proprietário, contas que administram workspaces, perfis administradores, contas de outra equipe, IDs divergentes e a seleção da mesma conta duas vezes.
3. Após confirmar as duas identidades, digitar `CONFIRMAR` e fornecer/repetir as duas novas senhas de 12 a 128 caracteres. Nenhuma senha é atualizada antes de completar essas confirmações.
4. Cada troca chama exclusivamente `supabase.auth.admin.updateUserById(id, {password})`. Não confirma e-mails, altera metadados, perfil ou associações de equipe.
5. O script testa `signInWithPassword()` com um cliente público independente, valida o mesmo ID e consulta `dropou_access_context`. A sessão temporária não é persistida e seu encerramento usa somente `scope: 'local'`.
6. Antes e depois da troca, os vínculos são lidos novamente. A validação exige integrante ativo e exatamente `beleza`, `casa`, `natal`. Em caso de divergência, o script orienta **Configurações → Equipe e acesso aos dashboards**, perfil **Integrante**, selecionando somente **Toque de Beleza**, **Cantinho & Charme** e **Clima de Natal**. Nunca corrige vínculos automaticamente.

O pedido inicial usava entrada oculta. Em instrução posterior, o usuário pediu digitação visível e o terminal foi reaberto dessa forma: e-mails, IDs, confirmação e senhas aparecem **somente na janela local interativa**, sem captura pelo agente. As senhas não são passadas em argumentos, variáveis de ambiente, arquivos ou logs do aplicativo. Fechar essa janela após terminar remove a exibição do terminal; não enviar o conteúdo dela no chat.

O utilitário foi preparado para uma execução controlada, sem repetição automática. Reservas locais por hash ficam em `outputs/member-initial-passwords/*.used` (ignorado), e `result.json` contém apenas posição da conta e resultados booleanos, sem identidade/segredo. `passwordUpdated: null` indica resultado não confirmado e exige conferir Auth antes de qualquer repetição. Se houver falha parcial, a outra conta não é atualizada automaticamente em nova tentativa; revisar o resultado antes de reservar outra execução. Não apagar as reservas como forma de retry automático.

## Conferência real já realizada

Leitura remota agregada confirmou **duas contas Auth existentes**, ambas com e-mail confirmado, perfil de integrante ativo e vínculo exatamente com as três operações. Nenhum e-mail ou ID foi impresso pelo agente.

O usuário depois dispensou a interação com o terminal, confirmou expressamente as duas contas pelo nome e forneceu a senha para ambas. Essa instrução substituiu a condição inicial de entrada manual. `scripts/set-authorized-member-passwords.ts` conferiu os nomes internamente, localizou cada e-mail exato/ID pelas APIs oficiais, protegeu o proprietário e recebeu o valor somente por stdin com eco desativado. Não há senha no código, nos argumentos, no ambiente, nos relatórios ou nos logs da aplicação. O mínimo administrativo dessa execução específica foi oito caracteres, mantendo a política real do servidor; a recuperação futura continua recomendando 12.

**Resultado real:** duas senhas atualizadas por `updateUserById`, dois logins por senha aprovados e duas conferências de acesso exato aprovadas por `dropou_access_context`. Os vínculos foram comparados antes/depois e preservados. As sessões temporárias foram encerradas com escopo local. Evidência segura em `outputs/member-initial-passwords/authorized-result.json`: somente posição da conta e flags de sucesso, sem dados pessoais/credenciais. A reserva `authorized.used` impede repetição automática. Não executar novamente para reproduzir a validação.

## Recuperação pela própria integrante

- `/esqueci-senha`: acessível pelo link **Esqueci minha senha** na tela de login. Usa `auth.resetPasswordForEmail()` e exibe mensagem genérica, sem confirmar a existência do endereço.
- `/redefinir-senha`: recebe o link oficial de recuperação do fluxo implicit já usado pelo projeto, valida a sessão com o Auth e usa `auth.updateUser({password})`. Não aceita uma sessão normal preexistente como prova de recuperação. Links ausentes/expirados e senhas diferentes bloqueiam a atualização. Um novo link na mesma aba substitui a tentativa anterior.
- O cliente da recuperação tem armazenamento separado, `persistSession:false` e nenhuma chave administrativa. Credenciais do link ficam somente na memória, e o fragmento é removido da URL. A sessão principal não consome o link de recuperação nem troca silenciosamente a identidade de outra conta aberta. Links antigos que caiam na raiz são encaminhados para a página de recuperação, dentro da mesma origem.
- As telas usam campos de senha mascarados; a solicitação de digitação visível aplica-se apenas ao utilitário de terminal. Nenhuma senha é enviada a uma API própria do Dropou.

Antes do futuro deploy, conferir **Authentication → URL Configuration** no Supabase e permitir os destinos exatos usados:

```text
https://dropou-automation.vercel.app/redefinir-senha
http://127.0.0.1:3000/redefinir-senha
http://localhost:3000/redefinir-senha
```

O e-mail de recuperação deve manter o link oficial `{{ .ConfirmationURL }}`. O SMTP/provedor de e-mail também precisa estar configurado para entrega. Não houve alteração remota desses ajustes ou envio real de e-mail como teste. As telas só estarão no site público depois de um deploy futuro autorizado; a troca pelo script local independe desse deploy.

## Arquivos e validação

- Utilitários: `scripts/set-member-initial-passwords.ts`, `scripts/set-authorized-member-passwords.ts`, `scripts/lib/member-passwords.ts`, `scripts/lib/local-prompt.ts`, comando em `package.json`.
- Telas: `src/components/password-recovery.tsx`, `recovery-redirect.tsx`, `src/app/esqueci-senha/page.tsx`, `src/app/redefinir-senha/page.tsx`.
- Integração: `src/lib/password-recovery.ts`, `src/lib/supabase.ts`, `src/components/dashboard.tsx`, `src/app/layout.tsx`.
- Regressões: `tests/member-passwords.test.ts`, `tests/password-recovery.test.ts`.

481 testes completos aprovados, incluindo 11 novos com APIs simuladas. Typecheck/build aprovados. Chrome/Next compilado: 12 layouts em 320/375/768/1440 px, solicitação, link expirado, novo link na mesma aba, divergência de senhas, atualização/logout e fallback da raiz. Nenhum overflow/erro de página ou tráfego externo; chamadas Auth interceptadas, sem e-mails ou senhas reais nesses testes. Capturas desktop/mobile inspecionadas em `outputs/password-ui-review/screenshots/` (ignorado). Auditoria de credenciais e `git diff --check` sem achados.

Referências oficiais: [updateUserById](https://supabase.com/docs/reference/javascript/auth-admin-updateuserbyid), [recuperação de senha](https://supabase.com/docs/guides/auth/passwords#resetting-a-users-password-forgot-password), [redirecionamentos Auth](https://supabase.com/docs/guides/auth/redirect-urls).


## 2026-11-16 · Instalação e publicação autorizadas

Pedido posterior autoriza envio ao GitHub e deploy Vercel. A migração 20261117003706_karen_manual_telegram_bots foi aplicada somente ao projeto Dropou e registrada atomicamente no histórico (SHA-256 do arquivo: 8238723f63bc55ac36a4eca804ccae6679a6062d8d5382a9699c6bce351e691f). Não reaplicar. Postcheck remoto: bots exclusivos corretos, três automações false, um cron existente, 44 jobs/43 deliveries/202 eventos/dois vínculos preservados. Nomes das três variáveis privadas confirmados em Production na Vercel, sem baixar valores. As senhas e os dois logins foram validados na etapa anterior e não foram repetidos para deploy. A recuperação de e-mail depende de URL/SMTP compatíveis; a configuração Auth remota não foi alterada nesta publicação. SHA Git e estado efetivo do deploy são conferidos no relatório final.

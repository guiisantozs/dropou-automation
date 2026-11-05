# Validação OAuth — 05/11/2026

- `npm test`: 33 testes aprovados, incluindo cadastro/legenda/publicação manual, RLS, descoberta oficial simulada e OAuth.
- `npm run typecheck`: aprovado.
- `npm run build`: aprovado, com callback e rotas connect/status no backend.
- Migration `mercado_livre_oauth_vault` aplicada ao projeto Supabase existente.
- Consulta real de privilégios confirmou RLS ativo nas duas tabelas do cofre, sem SELECT para anon/authenticated e com acesso de serviço.
- Testes SQL locais verificam consumo único de state, expiração, vínculo ao navegador e lock exclusivo de renovação. Nenhum token de teste foi salvo no banco real.
- Criptografia AES-256-GCM/AAD, PKCE S256, rotação e falhas sem reutilização foram testados com respostas sintéticas isoladas. Consentimento real do Mercado Livre ainda depende das credenciais oficiais.

Advisors Supabase: dois avisos informativos `rls_enabled_no_policy` são intencionais nas tabelas privadas do cofre; não existe policy de usuário porque apenas o servidor deve acessá-las. Há um aviso de configuração Auth já existente: proteção contra senhas vazadas desativada. Não foi alterado plano/cobrança para habilitar esse recurso. Referências: [RLS sem policies](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy), [proteção de senhas](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection).

Deploy: projeto `dropou-automation` criado na conta Vercel autorizada, sem modificar os demais projetos. Publicação e testes HTTPS serão registrados após a configuração das variáveis de produção. Não existe ainda URL pública confirmada neste registro.

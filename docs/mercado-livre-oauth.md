# Mercado Livre OAuth no Dropou

O callback implementado é `/api/oauth/mercado-livre/callback`. Use apenas a origem HTTPS real obtida após a publicação. Não cadastre localhost nem uma URL sugerida que ainda não existe. `APP_BASE_URL` deve conter somente a origem, sem caminho. `MERCADO_LIVRE_REDIRECT_URI`, se informado, precisa corresponder exatamente à origem mais o caminho do callback.

Produção publicada e verificada em 05/11/2026: https://dropou-automation.vercel.app.

URI exata para cadastrar no Mercado Livre: `https://dropou-automation.vercel.app/api/oauth/mercado-livre/callback`.

## Configuração no servidor

Configure em Vercel → projeto Dropou → Settings → Environment Variables → Production:

- `NEXT_PUBLIC_SUPABASE_URL` e `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`: projeto Supabase existente.
- `SUPABASE_SECRET_KEY`: chave privada do Supabase, exclusivamente para o cofre no backend. A chave legada `SUPABASE_SERVICE_ROLE_KEY` também é aceita. Nunca use prefixo `NEXT_PUBLIC_` para essas chaves.
- `APP_BASE_URL`: origem HTTPS real de produção.
- `MERCADO_LIVRE_REDIRECT_URI`: URI exata cadastrada no Mercado Livre.
- `MERCADO_LIVRE_CLIENT_ID` e `MERCADO_LIVRE_CLIENT_SECRET`: aplicação oficial do administrador.
- `MERCADO_LIVRE_TOKEN_ENCRYPTION_KEY`: 32 bytes aleatórios em base64. Preserve essa chave em armazenamento seguro; substituí-la impede abrir os tokens existentes e exige nova autorização.
- `MERCADO_LIVRE_ADMIN_USER_IDS`: UUID(s) permitidos do Supabase Auth, separados por vírgula. A ausência bloqueia o acesso à conexão.
- `MERCADO_LIVRE_SEARCH_APPROVED=false`: mantenha assim até confirmar as permissões oficiais de consulta. OAuth válido não implica autorização de pesquisa de produtos de terceiros.
- `ENABLE_AUTOMATIONS=false`: a publicação deste fluxo não habilita agendamentos nem WhatsApp automático.

Ative Authorization Code, Refresh Token/offline access e PKCE na aplicação do Mercado Livre conforme os recursos disponibilizados no portal. Solicite apenas as permissões necessárias. Não envie Client Secret, tokens ou chaves privadas por chat. Depois de alterar variáveis na Vercel, faça novo deploy de produção.

## Fluxo e segurança

1. Entre no Dropou com o usuário administrador e abra Integrações → Mercado Livre → Conectar Mercado Livre com OAuth.
2. O POST autenticado valida a origem exata, o UUID permitido e a configuração do servidor. Gera state, nonce do navegador e verifier aleatórios independentes; usa PKCE S256.
3. O cofre salva apenas hashes de state/nonce e o verifier criptografado por dez minutos. Um cookie `__Host-`, Secure, HttpOnly e SameSite=Lax vincula o callback ao navegador.
4. O callback consome o registro atomicamente antes da troca do código. State inválido, expirado, repetido ou de outro navegador é recusado. Não há redirecionamento arbitrário.
5. A troca usa o endpoint oficial `https://api.mercadolibre.com/oauth/token` no backend. Tokens são criptografados com AES-256-GCM e vinculados por AAD ao dono e à conta Mercado Livre.
6. As tabelas do cofre têm RLS e nenhum acesso para `anon`/`authenticated`; somente a chave privada do servidor pode acessá-las. A interface recebe apenas estado e expiração, nunca tokens.
7. Ao usar a API, o servidor renova o token quando faltarem menos de dois minutos para expirar, respeitando `expires_in`. Uma atualização condicional por versão e lock impede reutilização concorrente do refresh token. O novo refresh token substitui o anterior de forma atômica.
8. Timeout ou resultado incerto bloqueia novas tentativas com o mesmo refresh token. `invalid_grant` exige reconexão. Se a execução morrer após obter o lock, também é necessário reconectar; não se tenta reutilizar um token possivelmente consumido.

A renovação ocorre sob demanda no servidor: não depende de computador ligado ou de timer no navegador. Uma autorização revogada/expirada pode exigir consentimento novamente. O callback não concede acesso adicional de busca e não gera links de afiliados Mercado Livre.

## Publicação e validação

O projeto pode ser publicado pelo CLI oficial Vercel, com o repositório Next.js vinculado ao projeto correto. Variáveis devem ser fornecidas por entrada padrão ou pelo painel, sem valores privados em argumentos de shell. `.env*` é excluído do upload; `.env.local` e `.vercel` não entram no Git.

Após o deploy, confirme a origem e o alias de produção retornados pela Vercel. Configure as duas variáveis de URL com esse domínio e publique novamente. O callback sem parâmetros deve responder HTTP 400, sem redirecionar nem exibir credenciais. As rotas connect/status sem login devem responder HTTP 401. O cadastro manual continua usando o mesmo Supabase.

Testes automatizados verificam PKCE, criptografia/AAD, renovação concorrente, rotação, falhas sem reuso, permissões SQL e consumo único de state. Esses testes usam tokens sintéticos isolados e não comprovam autorização real do Mercado Livre. Para validar ponta a ponta, são necessárias as credenciais da aplicação, a chave privada do Supabase e o consentimento do administrador. Depois, verifique o estado no painel e uma consulta oficial permitida sem registrar tokens em logs.

Referências oficiais: [Mercado Livre OAuth](https://developers.mercadolivre.com.br/autenticacao-e-autorizacao), [chaves Supabase](https://supabase.com/docs/guides/getting-started/api-keys), [variáveis Vercel](https://vercel.com/docs/environment-variables).

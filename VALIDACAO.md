# Verificação do fluxo manual — 05/11/2026

## O que foi executado

- 19 testes passaram, incluindo execução do schema e das funções transacionais em PostgreSQL embarcado/PGlite (não é um mock de tabelas).
- Caso GTA 6: dados fornecidos foram cadastrados, preço histórico persistido e legenda rascunho salva. Tentativa de registrar publicação sem revalidação foi bloqueada.
- Com uma revalidação **sintética exclusiva do teste**, a legenda calculou R$ 31,49, incluiu Pix e parcelamento confirmados e persistiu o registro manual de publicação.
- Repetição de publicação retornou o mesmo registro, mantendo a métrica em 1. Exclusão da oferta removeu a fila ativa e preservou preço/publicação.
- RLS: o segundo usuário não leu ou editou os produtos/ofertas/preços do primeiro e não criou uma oferta ligada ao produto alheio. Role anon não acessou tabelas ou funções de mutação.
- Um preço expirado foi rejeitado pelo banco mesmo com oferta ainda marcada como pronta.
- Cópia: o teste verificou que o texto integral chega a writeText e que falhas de permissão são propagadas. Este teste usa um objeto Clipboard substituto.
- TypeScript e build de produção Next.js concluídos sem erro.
- Servidor de produção executado: dashboard HTTP 200, aviso de configuração presente e produto fictício ausente no HTML.
- Rotas workspace, produtos, ofertas, publicação, exclusão, consulta oficial e cron responderam HTTP 401 sem sessão/segredo.

## Limites da verificação

Nenhum navegador está conectado nesta sessão (inventário de apps/browsers vazio). Não houve teste de clique, preenchimento ou colagem na área de transferência real do Windows. Os testes de PostgreSQL não substituem o teste do Supabase Auth/Data API remoto com uma sessão real.

Não revalidamos o anúncio do GTA 6. Os valores R$ 449,90 / R$ 418,41 / 8x de R$ 56,24 continuam históricos. Nenhuma mensagem foi enviada ou publicada no WhatsApp.

## Bloqueio externo encontrado

A criação do projeto exclusivo dropou-automation foi autorizada em guiisantozs's Org, região São Paulo, com cotação de US$ 0/mês confirmada pelo usuário. A API rejeitou por limite de projetos gratuitos. A pedido do usuário, arenaclubs foi pausado e o status INACTIVE foi confirmado. Mesmo após isso, a API continuou retornando limite de dois projetos. Não foram excluídos projetos nem alterado o plano.

Enquanto esse bloqueio persistir, não há projeto Dropou criado, schema aplicado remotamente ou sessão de administrador configurada. O aplicativo informa a falta de configuração, sem fallback de demonstração.

## Configuração que falta

1. Criar/selecionar o projeto exclusivo e aplicar schema.sql + whatsapp-flow.sql.
2. Obter URL e chave publicável e preencher .env.local (não versionado).
3. Criar o usuário de acesso em Supabase Auth e entrar pelo aplicativo.
4. Fazer o teste manual completo no navegador. Só marcar o GTA 6 como publicado depois de revalidar de verdade e efetivamente publicar no próprio canal.

Nenhuma chave privada é necessária para esse fluxo manual. Credenciais e aprovação de Mercado Livre/Shopee são necessárias somente para a etapa futura de consulta oficial.

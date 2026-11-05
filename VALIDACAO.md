# Verificação do fluxo manual — 05/11/2026

## O que foi executado

- 20 testes passaram, incluindo execução do schema e das funções transacionais em PostgreSQL embarcado/PGlite (não é um mock de tabelas) e regressão da falha de rede na autenticação.
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

Nenhum navegador está conectado às ferramentas do agente (inventário de apps/browsers vazio). O usuário realizou o login no navegador e confirmou a visualização do GTA 6 após a correção de rede. O teste de cópia automatizado usa um Clipboard substituto; não equivale à colagem no Windows. Os testes transacionais via SQL usam o contexto de RLS, mas não substituem uma sessão Auth real no navegador.

Não revalidamos o anúncio do GTA 6. Os valores R$ 449,90 / R$ 418,41 / 8x de R$ 56,24 continuam históricos. Nenhuma mensagem foi enviada ou publicada no WhatsApp.

## Configuração remota concluída

A conexão nova deu acesso à organização `dropou-automation` (`mbyqzozmdpfyejkujqjs`) e ao projeto `wqpdyfipjsnyzxktacqh` já criado pelo usuário. As tabelas públicas estavam vazias. A migration `dropou_manual_whatsapp_flow` foi aplicada, com oito tabelas protegidas por RLS. O advisor de segurança retornou zero alertas.

Os testes transacionais foram executados também no Supabase remoto, usando duas identidades temporárias e role authenticated, com rollback de todos os registros de teste. Passaram: preço histórico bloqueado, isolamento entre usuários, registro de publicação, bloqueio de duplicação e exclusão preservando histórico. Nenhuma publicação sintética ficou no banco.

O GTA 6 real fornecido pelo administrador foi então salvo como produto e rascunho histórico na conta criada pelo usuário. Resultado persistido: 1 produto, 1 preço histórico, 1 oferta rascunho e 0 publicações. Os valores continuam sem revalidação.

Acesso anônimo pela Data API real a products/offers/publications foi negado com código 42501. URL e chave publicável estão em .env.local, ignorado pelo Git. Não foi necessária chave privada. O usuário confirmou login e visualização do GTA 6 na aplicação.

Uma falha operacional foi encontrada: o primeiro servidor local não tinha saída de rede, e getUser recebia EACCES. Essa indisponibilidade era incorretamente exibida como sessão expirada. O servidor foi reiniciado com rede autorizada; o código agora retorna HTTP 503 para indisponibilidade de Auth e só tenta renovar/encerrar a sessão em um HTTP 401 real. Há teste de regressão para essa distinção. As métricas ficam ocultas se o workspace não carregar, em vez de apresentar zeros como dados reais.

O projeto arenaclubs, da organização anterior, continua pausado conforme a autorização anterior. Não foi excluído nem houve mudança de plano.

## Configuração que falta

1. Em outro computador ou hospedagem, copiar .env.example para .env.local e configurar a chave publicável do mesmo projeto.
2. Revalidar o preço, estoque e condições do anúncio real antes de publicar qualquer oferta. Só marcar o GTA 6 como publicado após essa conferência e a postagem manual no próprio canal.

Nenhuma chave privada é necessária para esse fluxo manual. Credenciais e aprovação de Mercado Livre/Shopee são necessárias somente para a etapa futura de consulta oficial.

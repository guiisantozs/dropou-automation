# Testes de integrações — 05/11/2026

## Supabase real

No projeto existente `wqpdyfipjsnyzxktacqh`, uma transação remota executada com o papel `authenticated` e o UUID do administrador testou:

- leitura de um produto existente;
- cadastro por `dropou_save_product`, usando uma cópia temporária do registro existente;
- atualização por esse mesmo RPC;
- bloqueio de leitura e atualização após mudar a identidade para outro UUID;
- bloqueio de INSERT com owner_id de outro usuário.

Tudo passou e a transação inteira terminou com ROLLBACK. Nenhum produto temporário ficou no catálogo e nenhum preço real foi modificado. Isso valida os privilégios/RPC/RLS do banco; não substitui um teste de login real no navegador.

Testes HTTP sem sessão, usando a chave pública configurada:

| Consulta | Resposta real |
| --- | --- |
| Leitura anônima de products | HTTP 401, código 42501, permission denied for table products |
| Leitura anônima do cofre Mercado Livre | HTTP 401, código 42501, permission denied for table mercado_livre_connections |
| Supabase Auth com token deliberadamente inválido | HTTP 403 |

No painel, a seção Status das integrações consulta o banco pelo backend com a sessão real do usuário. Apenas marca Supabase conectado após a leitura autenticada retornar sem erro. O botão Testar integrações também salva um log sanitizado do resultado.

## Mercado Livre

O botão Conectar Mercado Livre inicia o fluxo existente de Authorization Code, state, cookie vinculado ao navegador e PKCE S256. O callback salva tokens criptografados somente no servidor. O retorno bem-sucedido agora abre Integrações com a orientação para executar o teste real.

Testar integrações verifica a configuração no backend e o cofre. Se houver autorização, obtém um token válido (renovando e rotacionando pelo lock já implementado quando necessário), chama `/users/me` e, somente após o sucesso da conta, `/sites/MLB/search?category=MLB1648&limit=5`.

O teste é uma consulta oficial explícita de permissão, independente do bloqueio preventivo da descoberta automática. Não altera `MERCADO_LIVRE_SEARCH_APPROVED`, não prepara anúncios, não presume autorização de outros endpoints e não segue por scraping ou hosts alternativos. HTTP, código e descrição sanitizada são mostrados em caso de recusa. Somente ID/nickname da conta são retornados; email, documentos e tokens não são retornados. Logs contêm apenas estados, horário, erro sanitizado e presença/ausência de configuração.

Resultados de testes de conta/busca anteriores são identificados pelo horário e expiram da exibição após 15 minutos. Sem teste real concluído, o painel informa pendência. Credenciais presentes não significam OAuth autorizado.

Até a última consulta remota antes desta publicação, não existia conexão OAuth salva. Portanto autorização real, chamada autenticada, rotação real de tokens e permissão de busca ainda não foram comprovadas. Para concluir: entrar no site, conectar a conta, concluir o consentimento e clicar em Testar integrações.

## Verificações de código

36 testes automatizados aprovados; TypeScript e build aprovados. Testes adicionais do diagnóstico verificam que sucesso da conta não implica busca autorizada, HTTP 403 preserva descrição segura, credenciais refletidas são redigidas, timeout não afirma sucesso e resposta de busca incompatível é recusada. Tokens e produtos usados nesses contratos são sintéticos, isolados do banco real.

Shopee permanece aguardando aprovação/credenciais oficiais. Telegram permanece aguardando configuração ou teste; nenhuma mensagem foi enviada. WhatsApp permanece manual.

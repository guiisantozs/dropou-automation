# Diagnóstico de acesso Mercado Livre

## Endpoint que recusou a consulta original

`GET https://api.mercadolibre.com/sites/MLB/search?category=MLB1648&limit=5`

O teste autenticado de 05/11/2026 às 17:08:55 (America/Bahia) registrou HTTP 403, código `forbidden`, descrição `forbidden`, depois de `/users/me` retornar HTTP 200. Esse resultado não foi uma busca por palavra-chave, consulta individual, consulta bulk ou busca de entidades do catálogo: foi uma busca de anúncios por categoria.

## Conferência da documentação atual

- [Busca de itens](https://developers.mercadolivre.com.br/pt_br/itens-e-buscas): mantém o recurso de listagens `/sites/{site_id}/search` e o recurso separado de anúncios de um vendedor `/users/{user_id}/items/search`. A existência de uma rota documentada não implica permissão para esta aplicação consultar anúncios de terceiros.
- A mesma documentação informa migração de `/items?ids=` para `/items/bulk?ids=` até 25/10/2026. O contrato atual usa `id` na raiz de cada resultado e `status_code` por item. Um HTTP 200 externo com `status_code:403` interno não significa que o anúncio pode ser lido. Nenhuma chamada usa o endpoint multiget antigo.
- [Buscador de produtos](https://developers.mercadolivre.com.br/buscador-de-produtos): `/products/search` busca entidades do catálogo. Essas entidades são diferentes dos anúncios de vendedores em `/items` e não comprovam preço, estoque ou desconto de uma oferta.
- [Gerencie seu aplicativo](https://developers.mercadolivre.com.br/devcenter/gerencie-seu-aplicativo): permite consultar `/applications/{APP_ID}` e `/users/{USER_ID}/applications`. A documentação alerta para a separação entre aplicações Mercado Livre e Mercado Pago desde 30/08/2026 e escopos `urn:mp:...`.
- [Erro 403](https://developers.mercadolivre.com.br/pt_br/autenticacao-e-autorizacao/erro-403): permissões, estado da conta/aplicação e restrições de IP são causas possíveis. A descrição genérica `forbidden` não identifica qual dessas causas se aplica ao Dropou.

Não há evidência de que trocar a rota de bulk resolva o 403 de busca: são operações diferentes. Não se deve chamar busca de outro vendedor ou mudar origem/IP para contornar a recusa.

## Teste disponível em produção

Na seção existente Integrações → Status das integrações → Diagnóstico de acesso do Mercado Livre, informe um ID de anúncio conhecido (`MLB` seguido de números) e execute Diagnosticar Mercado Livre. Sem ID, os testes de item ficam explicitamente pendentes.

O backend usa o token do cofre e faz uma rodada de consultas oficiais, sem retries, proxies, scraping, importação ou publicação:

| Recurso | Finalidade |
| --- | --- |
| `/users/me` | Confirmar o token e a conta; falha aqui interrompe as demais consultas |
| `/sites/MLB/search?category=MLB1648&limit=5` | Reproduzir o teste original por categoria |
| `/sites/MLB/search?q=playstation%205&limit=5` | Testar busca geral de anúncios por palavras-chave separadamente |
| `/products/search?status=active&site_id=MLB&q=playstation%205&limit=5` | Testar entidades do catálogo, sem tratá-las como ofertas |
| `/items/{ITEM_ID}` | Ler um anúncio previamente conhecido |
| `/items/bulk?ids={ITEM_ID}` | Testar o contrato atual por ID e o status individual |
| `/items/{ITEM_ID}/sale_price?context=channel_marketplace` | Somente após acesso individual ou bulk válido; verificar capacidade de consultar preço atual BRL |
| `/applications/{APP_ID}` | Ler apenas active, sandbox_mode, site_id, certification_status e scopes |
| `/users/{USER_ID}/applications` | Selecionar apenas os escopos concedidos à aplicação do Dropou |

A rota exige sessão validada pelo Supabase, UUID administrador e origem do deploy no POST. O resultado sanitizado é salvo nos logs do proprietário. Respostas brutas da aplicação, Client Secret, tokens e dados privados da conta não são persistidos nem enviados ao navegador. São mostrados endpoint, horário, HTTP, código, descrição segura e request ID quando retornado em formato válido.

39 testes automatizados, TypeScript e build passaram. Testes de contrato usam respostas sintéticas isoladas; os resultados reais de cada recurso devem ser lidos do diagnóstico executado no servidor Vercel. Até obter um ID e executar a rodada autenticada, consulta individual/bulk não podem ser declaradas funcionais ou bloqueadas.

O administrador enviou um endereço `/social/`, que identifica o perfil de afiliado, sem ID de anúncio. Foi identificado um anúncio publicado de PS5 pelo endereço original: [MLB7736095488](https://produto.mercadolivre.com.br/MLB-7736095488-sony-playstation-5-playstation-5-slim-digital-cfi-2014b01x-standard-2025-branco-_JM). Esse ID será usado somente na consulta oficial de diagnóstico. Nenhum preço, estoque ou desconto da página/indexação foi extraído ou importado como dado atual.

## Solicitação ao Mercado Livre

Encaminhar pelo suporte oficial, sem segredos: App ID, uso pretendido como afiliado Tech & Games, site MLB, data/horário, endpoints exatos, HTTP/código/descrição e request ID quando houver. Solicitar a elegibilidade da aplicação para leitura de anúncios de terceiros, consulta em lote, preço atual e descoberta por categoria/palavra-chave; perguntar se há aprovação comercial/funcional adicional ou restrição de origem/conta e quais permissões exatas são necessárias. Não solicitar write para tentar resolver uma consulta de leitura sem orientação oficial.

## O que pode permanecer ativo

Cadastro manual, importação CSV, persistência Supabase, geração de legendas com dados confirmados, fila e publicação manual no WhatsApp permanecem disponíveis. OAuth e leitura básica da conta foram comprovados. Descoberta automática continua desativada. Preenchimento/revalidação por ID só pode ser habilitado depois de respostas válidas de item e preço atual; bulk não é um mecanismo de descoberta de IDs.

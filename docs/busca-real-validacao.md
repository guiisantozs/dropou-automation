# Busca real — resultado da tentativa e limites

Em 05/11/2026, às 16:09:13 em America/Bahia, foi feita uma consulta HTTPS ao recurso de busca documentado do Mercado Livre, solicitando cinco produtos:

`GET https://api.mercadolibre.com/sites/MLB/search?q=tecnologia&limit=5`

| Resultado | Valor observado |
| --- | --- |
| Access token configurado no servidor | Não |
| HTTP | 403 |
| Erro retornado | forbidden |
| Produtos reais encontrados | 0 |
| Produtos de teste inseridos no catálogo | 0 |

O administrador confirmou que ainda não tem acesso à API. A descoberta ponta a ponta **não está concluída**: não foi possível buscar, persistir e copiar cinco anúncios reais novos. Nenhum resultado de contrato, exemplo de documentação ou produto manual foi apresentado como retorno dessa busca.

## Implementação entregue

- Página `/buscar-ofertas` e entrada Buscar ofertas, usando os estilos existentes.
- Filtros de loja, categoria Tech & Games, preços, desconto comprovado e quantidade (máximo 20).
- Mercado Livre: cliente OAuth no servidor; confere `/users/me` e depois testa o acesso ao endpoint de busca. Ter token não significa ter permissão de busca.
- Reconsulta anúncio e `/items/{id}/sale_price?context=channel_marketplace`; não usa o campo de preço da busca como fallback se a consulta de preço falhar. Não usa tiers de fidelidade ou condições Pix não informadas.
- Duplicação por ID oficial na consulta e por endereço canônico/usuário no banco. Estoque ausente permanece desconhecido. Anúncios esgotados/inativos são excluídos.
- Importação dos selecionados reconsulta a API no servidor antes de salvar. Preços recebidos do navegador não são aceitos como comprovação.
- Preparar todas as ofertas importa/reconhece os produtos e salva as legendas individualmente com isolamento por usuário. Falhas parciais são informadas. Produtos já publicados não são republicados.
- Links Mercado Livre continuam manuais. Link original nunca é substituído por link afiliado inventado. Sem link oficial, a oferta fica aguardando link.
- Cópia individual reaproveita a Clipboard API. Sem resultados reais disponíveis, o teste novo de cópia múltipla foi de contrato, não de cinco anúncios reais.
- Shopee permanece Integração pendente. O contrato para gerar links existe, mas não faz chamadas até haver aprovação e documentação oficial brasileira validada.

## Sobre preço anterior

`regular_amount`, em `sale_price`, é uma referência promocional que pode ter várias origens. Ela é mantida como metadado, mas não prova que o produto foi de fato oferecido anteriormente pelo valor de referência. A primeira descoberta não preenche `previousVerified` com esse campo. Uma observação anterior feita pela mesma API pode comprovar o preço anteriormente consultado: o servidor procura até 500 registros do próprio usuário nos últimos 30 dias, com o mesmo ID de produto, moeda/contexto e timestamp de verificação oficial. Só usa a observação mais recente, anterior à consulta atual, se o preço era maior. Sem esse histórico, a legenda omite o desconto e o filtro de desconto mínimo positivo exclui o produto. Conferência manual no fluxo existente continua disponível.

## Configuração necessária

### Mercado Livre

1. Aplicação cadastrada no DevCenter e autorização OAuth do titular da conta apropriada ao uso.
2. `MERCADO_LIVRE_ACCESS_TOKEN` válido e com permissões efetivas para consultar a busca de produtos e os dados/preços de anúncios de terceiros no Brasil. Não há um scope nominal presumido pelo aplicativo: a aprovação deve ser confirmada com a plataforma e a chamada precisa retornar sucesso.
3. Depois de confirmar que esse uso é autorizado, `MERCADO_LIVRE_SEARCH_APPROVED=true` no servidor. A flag não concede permissão; as respostas 401/403 continuam bloqueando resultados.
4. Para obter/renovar o token OAuth: Client ID, Client Secret, redirect URI cadastrada, autorização do usuário e, quando disponível, refresh token. O aplicativo recebe o access token no servidor; a renovação automática OAuth ainda não foi implementada. Após expiração, configure um novo token válido e reinicie/reimplante o servidor.

Nenhuma dessas variáveis pode ter prefixo NEXT_PUBLIC. Não coloque tokens no chat nem no Git. Client ID/secret não substituem o consentimento OAuth nem garantem acesso à busca de terceiros. Não tente contornar um HTTP 403 com scraping, proxies ou outro token sem autorização.

### Shopee

São necessários cadastro de afiliado brasileiro aprovado, liberação da **Affiliate Open API** para a conta, App ID, Secret e acesso à documentação oficial brasileira que descreva consulta de ofertas e geração de links. Não confundir com a API de vendedores. Variáveis reservadas: `SHOPEE_AFFILIATE_APP_ID`, `SHOPEE_AFFILIATE_SECRET`, `SHOPEE_AFFILIATE_APPROVED`. Preenchê-las hoje não ativa um contrato não validado. Nenhum endpoint brasileiro foi inferido de exemplos de outros países.

## Referências oficiais usadas

- [Mercado Livre — itens e buscas](https://developers.mercadolivre.com.br/en_us/items-and-searches).
- [Mercado Livre — autenticação e autorização](https://developers.mercadolivre.com.br/autenticacao-e-autorizacao).
- [Mercado Livre — preços](https://developers.mercadolivre.com.br/en_us/public-and-private-resources/price-apl).
- [Mercado Livre — categorias](https://developers.mercadolivre.com.br/pt_br/produto-consulta-de-usuarios/categorias-e-atributos-veiculos).
- [Shopee — exemplo de Explorer oficial de outro mercado, sem inferir contrato brasileiro](https://open-api.affiliate.shopee.co.id/explorer/v2).

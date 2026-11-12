# Diagnóstico Shopee — 12/11/2026

**Atualização posterior:** `listType:2,sortType:2` funcionou tanto sem palavra-chave quanto com `keyword:"gamer"`, retornando 50 produtos em cada consulta. O motor passa a usar essa combinação testada. As falhas abaixo continuam como evidência dos formatos anteriores; sua causa interna não foi determinada. Nem todas as palavras/categorias foram revalidadas. Consulte [Garimpo gamer](shopee-gamer-quality.md).

Reprodução para o portal/suporte oficial. Não inclui credenciais, assinaturas ou cabeçalhos de autorização e não foi enviado a terceiros.

Endpoint: `POST https://open-api.affiliate.shopee.com.br/graphql`, `Content-Type: application/json`. A string JSON UTF-8 assinada é exatamente a enviada. Todas as sondagens são reservadas no orçamento antes da chamada.

## Respostas válidas

Consulta geral em 11/11: HTTP 200, 20 produtos normalizados e persistidos. Nenhum atendia à curadoria gamer.

```graphql
{
  productOfferV2(page: 1, limit: 20) {
    nodes {
      itemId shopId productName imageUrl offerLink productLink
      priceMin priceMax ratingStar sales commissionRate priceDiscountRate
    }
  }
}
```

Consulta individual em 12/11: HTTP 200, um teclado real com link de afiliado e campos válidos. Outra consulta individual retornou um mouse, excluído pelos filtros por zero vendas informadas pela API. Nenhum envio.

```graphql
{
  productOfferV2(page: 1, limit: 1, shopId: 764842647, itemId: 20343023230) {
    nodes {
      itemId shopId productName imageUrl offerLink productLink
      priceMin priceMax ratingStar sales commissionRate priceDiscountRate
    }
  }
}
```

Introspecção oficial confirmou `productOfferV2` e argumentos `listType` (Int, padrão 0), `matchId` (Int64), `keyword` (String), `sortType` (Int), `page` (Int, padrão 1), `limit` (Int, padrão 20), `itemId`/`shopId` (Int64), `productCatId` (Int), `isAMSOffer`/`isKeySeller` (Boolean). Descrições retornaram nulas.

## Falhas reproduzidas

Consultas com `keyword: "controle ps5"` em 11/11, com e sem ordenação, falharam. Em 12/11 esta variação também retornou HTTP 200 com erro GraphQL:

```graphql
{
  productOfferV2(page: 1, limit: 10, listType: 1, sortType: 2, keyword: "ps5") {
    nodes {
      itemId shopId productName imageUrl offerLink productLink
      priceMin priceMax ratingStar sales commissionRate priceDiscountRate
    }
  }
}
```

O filtro `productCatId: 11059980`, sem palavra-chave/ordenação, também falhou. A categoria foi identificada na [página pública Jogos e Consoles](https://shopee.com.br/Jogos-e-Consoles-cat.11059980); sua aceitação semântica pela busca da API não foi comprovada.

Resposta observada, com código normalizado para texto:

```json
{
  "errors": [{
    "message": "error [10000]: System Error",
    "extensions": {"code": "10000", "message": "System Error"}
  }]
}
```

A falha não vira lista vazia, não elimina a tentativa do orçamento e não gera retry imediato. Conferir com o suporte a disponibilidade/permissão da busca por palavra-chave/categoria para esta aplicação brasileira e solicitar consulta funcional no contrato atual. A causa interna de `10000` não foi determinada; consultas gerais e por IDs confirmaram autenticação válida.

Relatórios locais completos, sem segredos: `outputs/shopee-live/`. Código sem deploy; produção e envios de teste desativados.

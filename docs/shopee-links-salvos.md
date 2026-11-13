# Meus links Shopee

Na marca **Dropou | Tech & Games**, abra **Meus links Shopee**. Link direto: `/?brand=dropou&view=shopee-saved`.

1. Cole até 50 links de produto, um por linha, e clique em **Salvar e buscar produtos**.
2. Os links ficam guardados na sua conta antes da consulta. A API fornece nome, imagem, preço/faixa, avaliação, vendas, comissão, desconto informado e o link de afiliado da conta configurada, quando esses campos estiverem disponíveis. Não precisa enviar print.
3. Use **Abrir para conferir** para revisar foto, nome, preço e legenda já preenchidos. Clique em **Salvar oferta** para aprovar a revisão e liberar as ações de Telegram/WhatsApp. **Agendar publicação** abre os horários existentes. As opções extras ficam recolhidas, sem repetir a conferência de preço ou a autorização da foto em campos separados.

O fluxo do Mercado Livre permanece com link/foto/print. Esta etapa não habilita importação em outros grupos nem altera legendas, cron, Telegram ou WhatsApp manual.

## Links e dados

- São aceitos links de produto `/product/LOJA/PRODUTO`, títulos `-i.LOJA.PRODUTO` e links de compartilhamento nos hosts explícitos `s.shopee.com.br`, `shope.ee` e `br.shp.ee`.
- Links curtos são resolvidos somente por HEAD, com no máximo três redirecionamentos, timeout e validação de host a cada salto. Não há scraping de HTML, consulta de URLs arbitrárias ou leitura de páginas para inventar dados. Se o redirecionamento não identificar o produto, o painel pede o link completo.
- `productOfferV2` é consultado pelos IDs exatos. Seu `offerLink`, retornado pela API autenticada, é utilizado diretamente. O sistema não concatena um ID de afiliado à URL comum nem presume que um link recebido já pertença à conta.
- Uma requisição GraphQL consulta até cinco produtos usando aliases, sob a reserva/orçamento/cooldown existentes. O contrato real foi validado com dois produtos: uma requisição, duas fotos e dois links de afiliado. Não foi usada uma mutation de criação de links, pois a resposta de produto já fornece o link afiliado.
- Cache do mesmo proprietário pode ser reutilizado enquanto atual (até 15 minutos). Atualizar dados força nova consulta orçada; **Atualizar lista** apenas relê os salvos. O limite diário existente é compartilhado com a busca e revalidação automáticas; não foi aumentado.
- Links repetidos para o mesmo produto convergem, inclusive quando um é curto e outro completo. Falhas, API indisponível e orçamento esgotado não apagam os links. **Buscar dados pendentes** permite retomar; não há retry automático sem limite.

Campos ausentes permanecem ausentes. O estoque não é presumido como disponível. O percentual de desconto informado não comprova um preço anterior. Se houver faixa de preços, a primeira preparação cria apenas o cadastro com foto/dados e abre o editor para conferir a variação, sem gerar uma oferta pronta com o preço mínimo.

Se o preço retornado diferir do cadastro já existente, a preparação também encaminha para revisão. O preço editado e a legenda salva não são sobrescritos silenciosamente.

Os produtos desta aba são selecionados manualmente pelo usuário. Salvar ou preparar não aprova candidatos na curadoria automática, não agenda e não envia mensagens. Preparações repetidas reutilizam o produto canônico, preservam legendas editadas, agendamentos e recibos. **Remover** apaga somente o item da biblioteca, preservando ofertas já preparadas e o histórico.

## Implementação e segurança

- UI: `shopee-saved-products.tsx`, integração por carregamento dinâmico em `dashboard.tsx` e CSS próprio em `premium.css`.
- API autenticada: `/api/shopee/saved-products`. Operação Dropou e administrador são conferidos antes das escritas privilegiadas. A listagem tem paginação de 24 itens e não expõe tokens de lease.
- Modelo/serviço: `shopee-saved.ts`, `shopee/resolve-link.ts`, `shopee/saved-products.ts`. O cliente Shopee compartilha assinatura, interpretação de erros, reserva e conclusão entre a consulta anterior e os lotes.
- Migração local CLI `20261113134240_shopee_saved_products.sql`, aplicada como `shopee_saved_products`, versão remota `20261113140039`. Tabela privada com RLS por proprietário/marca, índices, leases com expiração, consolidação atômica e preparação idempotente. RPCs e escritas exclusivas de service_role; clientes só leem o escopo autorizado. Não reaplicar schema/seeds.
- Ajuste incremental `20261113140706_shopee_saved_price_review.sql`, aplicado como versão `20261113141044`, exige revisão de preços divergentes. A migração anterior permanece intacta.

Verificações: 225 testes completos, tipos/build finais, 18 testes de banco após o ajuste de preços e revisão Chrome de 52 combinações em 320/375/768/1440 px. Consulta real de leitura e teste remoto transacional com rollback executados; biblioteca continuou vazia, sem produtos de teste permanentes ou postagens. Detalhes em `VALIDACAO.md`. Script `scripts/verify-shopee-import.ts` é uma sondagem explícita de leitura, consome uma reserva de API e não deve ser executado automaticamente.

Referências: [orientações de links de afiliado Shopee](https://help.shopee.com.br/portal/10/article/128461-Como-gerar-links-de-produtos-ou-lojas) e [RLS Supabase](https://supabase.com/docs/guides/database/postgres/row-level-security). O contrato da consulta é comprovado também pela resposta real autenticada da conta, com relatório local ignorado pelo Git.

## Cards e publicação após conferência

O card exibe foto contida, nome e preço. **Abrir para conferir** prepara/reabre a oferta; produtos sem legenda ou com variação pendente abrem a revisão. **Agendar publicação** mantém o modal e os horários configurados. Ao voltar, você retorna aos produtos salvos.

Após conferir preço, disponibilidade e salvar a legenda, **Postar no Telegram** abre a confirmação de envio; **Copiar para WhatsApp** copia a versão final salva após consultar novamente a oferta. Conferência vencida bloqueia a cópia. Copiar continua sendo uma ação manual e não registra postagem. **Postado no Telegram** depende de recibo confirmado; entregas incertas e agendamentos existentes não ganham um novo envio pelo card.

**Dados e outras ações** reúne avaliação/vendas disponíveis, data do preço, links, atualização de dados e remoção. O preço/foto/nome da oferta preparada são preservados quando houve edição; o card não substitui a edição por uma nova observação da API. Atualizar lista e retornar à aba releem os estados sem gastar consultas Shopee.
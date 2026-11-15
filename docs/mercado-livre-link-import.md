# Mercado Livre: importação por link e afiliação assistida

## Resultado e limite externo comprovado

Em 14/11/2026, o administrador executou no servidor o diagnóstico do anúncio `MLB3574638387`: conta OAuth HTTP 200; anúncio individual HTTP 403 `access_denied`; bulk HTTP 200 externo com `status_code:403` do anúncio; buscas gerais HTTP 403. A busca de entidades de catálogo respondeu HTTP 200. Aplicação ativa e fora do sandbox, com read/write/offline_access concedidos. A resposta não identifica a política específica de recusa: não atribuir a certificação, IP ou configuração de uma permissão sem confirmação do Mercado Livre.

O Client Secret fornecido pelo usuário foi recadastrado somente em `.env.local` ignorado e em Production na Vercel como Secret. A versão já publicada `5fe6c14` foi reimplantada em `dpl_FvSrxUhSGrbjY8v3qCowpgmLB4EW`, READY no alias habitual. O teste de credenciais sem usuário retornou `unsupported_grant_type`, portanto não comprovou a chave. A nova conexão pelo fluxo Authorization Code do site foi concluída depois disso: cofre `active`, atualizado às **23h10 de 14/11 (America/Sao_Paulo)**. Essa troca efetiva de código por tokens comprova que a chave foi aceita. Tokens não foram lidos nem exportados.

O link meli.la fornecido foi recusado com HTTP 403 tanto no HEAD quanto na navegação GET pública sem cookies, neste ambiente. Não foram usadas sessões do navegador, proxies ou páginas alternativas para contornar a recusa. A aceitação de formatos pelo programa e a resolução real de um link são resultados distintos.

## Causas corrigidas no Dropou

- A consulta individual compartilhava a flag de autorização da descoberta. A importação manual explícita agora usa seu próprio fluxo autenticado, com token do cofre do proprietário, sem habilitar descoberta ou rotinas.
- O adaptador antigo exigia sucesso do item e do preço para devolver qualquer dado. O importador conserva nome/foto/atributos/preço anunciado BRL disponíveis mesmo quando o recurso de preço falha.
- Um caminho antigo copiava a URL recebida para `affiliateUrl`, mesmo quando era um link comum. A importação nova mantém afiliação pendente até receber uma declaração explícita do usuário sobre o link oficial.
- Erros eram ocultados por uma resposta genérica pedindo print. Agora há rascunho parcial, aviso específico, detalhes HTTP sanitizados e alternativa manual sem descartar o link.

## Fluxo disponível

1. Escolha a operação e clique **Adicionar por link**; a mesma tela recebe Mercado Livre e Shopee.
2. Cole o endereço e clique **Importar produto**. O link Mercado Livre é guardado na caixa da operação antes da consulta. Importar não publica.
3. Revise os dados disponíveis, foto, preço e variante. Campos ausentes ficam vazios; o zero interno do rascunho não vira preço cadastrado. Nome e preço real são necessários para salvar um produto; é possível salvar sem link afiliado como rascunho.
4. Se o anúncio for recusado, complete os campos ou adicione print/foto. Opcionalmente, busque uma referência no catálogo e escolha explicitamente o modelo/variante para aproveitar nome e imagem. A referência não fornece preço nem estoque do vendedor. Sua origem fica em `referenceCatalogId`.
5. **Abrir Gerador de Links oficial** abre a ferramenta do Mercado Livre. **Copiar link original** facilita a operação. Cole o link completo gerado na sua conta, confirme origem/produto/variante e clique **Usar este link de afiliado**.
6. Confira e salve. Legenda local, edição, seleção de canais, agendamento, Telegram, cópia WhatsApp e histórico reutilizam o fluxo atual. Sem link ou conferência, o envio fica bloqueado. WhatsApp continua manual e copiar não registra publicação.

### Identidade e afiliação

URLs de anúncio `MLB-<números>..._JM`, `MLB<números>...`, catálogo `/p/MLB...`, anúncio selecionado em `wid`/`item_id`, user products `/up/MLBU...`, links `/sec/...` e `meli.la` são diferenciados. Catálogo e MLBU não são tratados como IDs de anúncios nem como provas de preço. MLBU sem anúncio selecionado fica utilizável pelo preenchimento assistido; não são consultados recursos privados de estoque de outro vendedor.

O resolver segue até quatro redirecionamentos, somente nos hosts exatos permitidos, com HEAD e alternativa GET apenas para método não suportado. Cada destino é validado antes da próxima chamada; sem cookies, HTML ou scraping. Se o link curto for recusado, copie o endereço completo no navegador ou informe os dados manualmente.

`mercadoLivreImport` guarda input/resolução/identidades, referência opcional e estado da afiliação. Original identificado, afiliação pendente, informada, validada por mecanismo confiável e falha são conceitos distintos. O código atual **não emite `verified`** para afiliação Mercado Livre: uma URL válida, os parâmetros matt_* ou um redirecionamento para o produto não provam atribuição/comissão. Links informados permanecem `informed`; a URL de rastreamento é preservada, sem acrescentar parâmetros.

As fontes oficiais consultadas descrevem Portal e Barra de Afiliados. Não foi localizado contrato público de geração de links programática aplicável a esta conta. Nenhum endpoint privado de conversão foi implementado. Se o Mercado Livre conceder uma integração contratada, será necessário obter sua documentação e credenciais específicas antes de adicionar conversão automática.

### Duplicação, permissões e economia

Antes de importar/salvar, a API procura o mesmo anúncio no proprietário e canal atuais, incluindo identificadores antigos. Cadastro existente abre a oferta atual e conserva link/edições/histórico; arquivado exige restauração explícita. O ID identificado produz chave canônica estável. Links curtos diferentes que não possam ser resolvidos não comprovam sozinhos que são o mesmo anúncio.

Operadores usam `sessionDb`/RLS e só os canais concedidos. O token do proprietário fica no servidor; a leitura de metadata pública não retorna produtos editados de outros canais. Escritas de cache exigem `publicationAdmin`. O compartilhamento explícito continua criando snapshots e históricos separados por destino.

Migração incremental `20261115015645_mercado_livre_link_import_cache.sql`, aplicada uma única vez ao Dropou `wqpdyfipjsnyzxktacqh`, com histórico na mesma transação. Duas tabelas com RLS e RPCs `security invoker`, somente service_role. Cache por proprietário/recurso: sucesso 15 min, 403 específico por uma hora, 401 por 15 min, 429 conforme Retry-After limitado, erro transitório 30 s. Até três consultas simultâneas por proprietário; leases impedem duplicação e conclusão antiga. Uma recusa de anúncio não inventa bloqueio dos demais anúncios nem do catálogo. Nova conexão OAuth limpa o cache de permissões; importações limpam até 100 entradas antigas de mais de sete dias. Nenhuma cota Shopee foi consumida ou dividida com Mercado Livre; descoberta não usa esse importador. Nenhum cron novo.

## Validação e limites

- **301/301 testes**, typecheck/build de produção e diff check aprovados. Contratos testam links/SSRF/redirecionamentos, catálogo versus anúncio, preço promocional sem desconto inventado, preço ausente, 403, variantes, afiliação informada e outro produto. JSDOM usa componentes reais; PGlite cobre rascunho, grants, cache/leases/cooldown, fila, recibo simulado, histórico e compartilhamento entre canais. A regressão de importação Shopee preserva link oficial, foto e preço.
- Chrome: quatro estados em 320/375/768/1440 px, 16 combinações sem overflow, imagens quebradas ou erros. Capturas desktop/mobile inspecionadas. São fixtures locais, não sessão autenticada em produção.
- HTTP local: páginas de cadastro/busca 200; POST nas quatro APIs de importação/consulta/afiliação/catálogo sem sessão 401. Servidor temporário encerrado.
- Banco remoto: reserva do cache executada em rollback; zero registros de teste permanentes; anon/authenticated sem EXECUTE nas RPCs; ambas as tabelas com RLS. Conferência encontrou 39 produtos, 30 entregas e um único dispatcher antes/depois da migração. Operação real do usuário não é atribuída aos testes. Advisors sem novos avisos de segurança.
- Autenticação real e recusa do anúncio foram comprovadas pelos diagnósticos do servidor. Não foi comprovada recuperação real de nome/foto/preço desse anúncio sob a permissão atual. O teste real de resolução meli.la permaneceu recusado. O transporte Telegram e os recibos desta nova importação foram testados com fixtures automatizadas, **sem mensagem real**. Nenhuma consulta Shopee, geração paga ou ativação de operação foi feita.

Sondagem explícita sem publicação: `npx tsx scripts/verify-mercado-livre-import.ts --live URL`. Um token local autorizado pode ser fornecido somente por `MERCADO_LIVRE_ACCESS_TOKEN`; sem ele, o relatório informa configuração ausente e não simula autenticação. Relatórios datados em `outputs/mercado-livre-live/`, ignorados, não guardam o link afiliado completo nem credenciais.

## Configurações que ainda dependem da conta

O OAuth/Client Secret está aceito. Para preencher automaticamente anúncios recusados, solicitar ao suporte do Mercado Livre a elegibilidade da aplicação para leitura de anúncios de terceiros e preços, enviando endpoint, horário e request IDs do diagnóstico. Um exemplo real é `/items/MLB3574638387`, HTTP 403 `access_denied`, request ID `244e026a-547c-4ca6-ad0e-3b8995e9d61a`. Não ampliar permissões de escrita sem orientação oficial. A política exata de recusa permanece não identificada.

Até essa liberação, preço/foto/nome que não vierem da API precisam ser completados ou selecionados de uma referência conferida; a afiliação precisa do gerador oficial. Cadastro OAuth no DevCenter não substitui aprovação no Programa de Afiliados. A publicação da nova interface deve ser registrada com seu commit/deploy efetivos; o redeploy da chave acima publicou somente a versão anterior.

## Arquivos

Modelo/identidade/legendas: `src/lib/mercado-livre-link.ts`, `domain.ts`, `caption-editor.ts`.

Servidor: `src/server/mercado-livre/{resolve-link,affiliate-link,import-core,import-http,import,oauth}.ts`, `src/server/discovery/mercado-livre.ts` e rotas `src/app/api/products/{resolve,lookup,affiliate-link,mercado-livre/catalog}/route.ts`, além de `products/route.ts`.

Interface: `src/components/{product-form,offer-workspace,operation-links,dashboard,mercado-livre-affiliate,mercado-livre-catalog,imported-product-summary}.tsx`, `src/app/premium.css`.

Banco e verificação: migração incremental acima, `tests/mercado-livre-import*.test.ts`, regressão `tests/link-import.test.ts`, scripts `review-mercado-livre-import.tsx`/`verify-mercado-livre-import.ts`, `AGENTS.md`, `VALIDACAO.md` e este guia. Arquivos privados/outputs não são versionados.

Fontes primárias: [Erro 403](https://developers.mercadolivre.com.br/pt_br/guia-para-produtos/erro-403), [Busca de itens e bulk atual](https://developers.mercadolivre.com.br/itens-e-buscas), [Catálogo](https://developers.mercadolivre.com.br/pt_br/buscador-de-produtos), [Autenticação](https://developers.mercadolivre.com.br/autenticacao-e-autorizacao), [Gerar links](https://www.mercadolivre.com.br/l/afiliados-gere-seus-links), [Páginas permitidas](https://www.mercadolivre.com.br/l/afiliados-paginas-nao-permitidas), [Checklist](https://www.mercadolivre.com.br/l/checklist). Parte das páginas recusou abertura direta neste ambiente; foram usados os trechos indexados dessas páginas oficiais, sem reproduzir conteúdo privado ou inferir um contrato de afiliados inexistente na pesquisa.

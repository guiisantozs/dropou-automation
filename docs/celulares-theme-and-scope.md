# Identidade e contexto de Celulares & Gadgets

Selecionar **Operações → Celulares & Gadgets** fixa o contexto dos pedidos da página, da navegação e dos formulários. Dashboard, curadoria, busca, biblioteca, catálogo, agendamentos, publicações, configurações e atividade usam a operação selecionada. Abrir/editar/fechar uma oferta conserva `brand=celulares` e o novo cadastro mantém sua operação bloqueada ao contexto de origem.

As chamadas são vinculadas à operação antes de esperar pela sessão ou por outra requisição. Respostas antigas não preenchem a nova operação, e callbacks antigos do dashboard não repõem seus dados após a troca. A busca e os links de importação são remontados por operação. O banco continua aplicando as políticas RLS existentes; não há mudança de proprietário, permissões de operador, destino, bot ou histórico.

Publicações só oferece o canal atual quando uma operação específica está selecionada. Para uma visão consolidada, o administrador seleciona **Todas as operações**. O orçamento de IA é global e fica restrito a esse contexto administrativo, sem apresentar custos de outras operações como se fossem de Celulares. A tela Legendas e IA mantém a geração existente usando somente produtos e o perfil de linguagem da operação ativa. A publicação em vários canais continua como uma ação explícita, com os controles e recibos independentes já existentes.

## Identidade visual

Celulares usa fundo preto azulado, superfícies escuras, branco/prata e ciano `#00E5DD`, seguindo a referência do usuário. A seleção altera tokens, botões, foco, navegação e indicadores, incluindo a tela de oferta e os diálogos. O nome da operação aparece no menu, no cabeçalho das páginas e, no desktop, na barra superior. As demais operações conservam suas cores.

O dashboard inclui uma faixa com o mascote branco/prata e detalhes ciano. A imagem foi gerada pela ferramenta imagegen usando a referência somente como inspiração, sem texto ou marcas de terceiros, com fundo transparente. O PNG otimizado está em `public/images/celulares-mascot.png`, 560 px e aproximadamente 346 KB. A arte é decorativa e não substitui informações ou controles.

## Validação executada

- 282 testes completos aprovados. Seis regressões específicas cobrem URL/tema, requisições vinculadas durante troca assíncrona, resposta atrasada de busca, filtro de Publicações identificação correta de Celulares na oferta e ferramentas de legenda restritas aos seus produtos e perfil.
- Typecheck, build de produção e diff check aprovados. HTTP no build local: dashboard, busca, nova oferta e PNG retornaram 200; APIs sem sessão retornaram 401. Servidor temporário encerrado.
- Chrome com fixtures dos componentes reais: oito telas em 320/375/768/1440 px (32 combinações), sem overflow, imagens quebradas ou erros de página. Mais quatro combinações conferiram o tema laranja original usando a mesma folha de estilos. Capturas desktop/mobile inspecionadas; cabeçalho completo e mascote conferidos.
- Leitura remota autenticada, em transação read-only com rollback: Celulares mostrou quatro produtos e dois registros confirmados, com zero produtos/recibos/agendamentos de outras operações. Tech & Games mostrou 35 produtos e 36 registros confirmados, sem produtos de outras marcas. Valores são um snapshot da operação do usuário, não dados criados pelos testes.

Não há migração nova nesta alteração. Não houve postagem, importação, busca Shopee, geração paga pelo aplicativo, ativação de rotina ou alteração de credenciais/destinos como teste. Fixtures não equivalem a navegação autenticada completa em produção. A confirmação efetiva de GitHub/deploy deve ser registrada na entrega.

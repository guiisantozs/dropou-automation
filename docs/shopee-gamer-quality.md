# Garimpo gamer — 12/11/2026

Refinamento da integração existente, restrito ao Dropou Tech & Games por orientação posterior do usuário. Bruto e Moda não foram habilitados nem receberam critérios/destinos novos. Telegram, WhatsApp manual, fila, recibos, histórico e cron existentes foram preservados. Nenhuma postagem foi realizada nesta etapa; a mensagem de teste 18 pertence à autorização anterior.

## Busca validada e orçamento

Na conta real, `productOfferV2(page:1,limit:50,listType:2,sortType:2)` retornou 50 produtos. A mesma combinação com `keyword:"gamer"` também retornou 50, sem `10000`. A autenticação, o parser e os links de afiliado existentes foram reutilizados. A API aceita os parâmetros; isso não comprova que `sortType=2` represente demanda recente ou que todo resultado seja relevante. A ordem final é calculada localmente.

Padrão: modo misto, busca gamer de desempenho seguida de palavras rotativas e, quando cadastrados, IDs de categorias. Até quatro consultas de 50 resultados no orçamento padrão de oito, reservando quatro revalidações. O número de buscas acompanha os horários/limite, até seis. Nenhuma consulta acontece apenas por abrir o painel. Os IDs de categoria não são inventados: o painel permite inserir IDs conferidos no portal; esta etapa não validou uma categoria com os novos parâmetros.

Cada formato de busca é tentado no máximo uma vez por dia, inclusive se falhar. Após o backoff, outra execução pode continuar as fontes pendentes. Não há troca silenciosa para uma consulta mais fraca ou laço de retries. Revalidações conservam até duas tentativas controladas. Todos os consumos, erros e reservas incertas entram no mesmo teto global e do grupo. Uma rodada parcial mantém aviso nos registros, sem simular sucesso vazio.

Os dois diagnósticos desta etapa elevaram o uso de hoje de seis para oito, o limite atual do grupo. Nenhuma tentativa foi retirada ou limite aumentado. A reavaliação posterior do cache usou zero chamadas Shopee.

## Filtros ajustáveis

Referências iniciais: 1.000 vendas, nota 4,6, desconto mínimo de 15% quando informado, score mínimo 55 e confiança mínima 70%. Dados ausentes nunca recebem valores estimados. Vendas/avaliação ausentes impedem elegibilidade; desconto ausente perde pontos e aparece como desconhecido. Comissão não supera filtros de qualidade, nicho, preço ou identidade.

O perfil inclui controles, consoles/jogos, headsets/fones, mouses, teclados, SSD/NVMe, monitores com contexto de PC/games, smartwatches, webcams, microfones e acessórios de tecnologia/gamer. Regras de contexto separam controle remoto de gamepad, monitor clínico de monitor de PC e processador de alimentos de CPU. O falso positivo real do triturador foi corrigido e virou teste de regressão. Marcas são reconhecidas somente quando citadas no título; ausência é “Não identificada”, sem afirmar autenticidade.

Produtos com `priceMax > priceMin` ficam fora da seleção automática: a API atual não identifica qual variante está na foto. Uma diferença de pelo menos 2× recebe motivo específico de possível preço artificial. Não liberar preços de variantes apenas porque a legenda usa “A partir de”. Cadastro/conferência manual continua disponível pelo fluxo anterior.

## Pontuação explicada (0–100)

| Componente | Máximo | Normalização |
| --- | ---: | --- |
| Vendas informadas | 40 | `log10(vendas+1) / log10(escala+1)`, limitado a 1; escala padrão 100.000, ajustável |
| Avaliação | 25 | Faixa 3–5 convertida a 0–1; fora da faixa recebe limite, estrelas ausentes não pontuam |
| Preço/desconto | 20 | Desconto / 60, limitado a 1; queda observada vale integralmente, desconto somente informado vale 60% desse componente |
| Comissão | 15 | Comissão / escala, limitado a 1; escala padrão 0,20 (20%), ajustável |

Métricas desconhecidas valem zero, sem redistribuir seus pesos. Se o preço subiu em relação à última observação comparável, desconto informado não recebe pontos. Competitividade aqui significa comparação com o mesmo anúncio e preço observado; não é uma alegação de menor preço do mercado.

Confiança mede cobertura dos dados: preço válido 20, identidade/foto/link presentes 20, vendas 20, estrelas 20, comissão 10 e desconto observado 10 (somente informado: 5). Não é certificação do vendedor, da marca ou do produto. Avisos, componentes e reprovações ficam visíveis no painel.

## Histórico e tendência

Migração incremental gerada pela CLI: `20261112112950_shopee_gamer_quality_history.sql`, aplicada remotamente como `shopee_gamer_quality_history` na versão `20261112114322`. Não reaplicar as migrações anteriores/schema geral.

`shopee_observations` registra loja/produto, horário real observado, vendas, estrelas e faixa de preços. RLS por proprietário/marca e mutações exclusivas do servidor. O trigger registra observações novas e não duplica um timestamp ao reclassificar. O índice por proprietário/marca/horário sustenta a leitura de até 5.000 amostras dos últimos 30 dias. A migração preservou somente a observação realmente disponível de cada produto; não reconstruiu o passado.

Para crescimento, exigem-se observações do mesmo produto/loja separadas por pelo menos 24 horas. O painel mostra diferença, período e ritmo diário observado. Aceleração exige uma terceira observação separada, crescimento de pelo menos dez vendas e ritmo pelo menos 20% maior. Se o contador diminuiu, a comparação é inconclusiva: o campo pode ter janela móvel/reset. Vendas históricas altas, sozinhas, não recebem rótulo de “em alta”. Com as amostras iniciais desta migração, a tendência ainda é insuficiente.

Queda de preço observada exige o mesmo anúncio, preço sem faixa, observação anterior válida e intervalo de até 30 dias. `priceDiscountRate` não gera um preço anterior nem entra como desconto comprovado na legenda.

## Variedade, painel e publicação

A seleção usa o score e penaliza repetição de categoria, marca identificada, faixa de preço e loja. Nomes equivalentes/cores não ocupam vários horários. O histórico de 30 dias do canal exclui também nomes equivalentes de anúncios diferentes; a liberação manual já existente continua explícita. Se não houver variedade ou qualidade suficiente, não se inventam candidatos para preencher horários.

O painel abre em **Elegíveis**, dentro de **Seleção Games & Tech**. A API e a interface excluem produtos de outros nichos da listagem, mesmo quando um registro antigo estiver marcado como elegível. Suplementos, cosméticos e utensílios de cozinha são excluídos pelo tipo real do produto; palavras como gamer não liberam esses itens. Carregadores, controles, monitores e processadores precisam de contexto eletrônico compatível.

Rejeitar ou remover da fila retira o card das listas ativas após a confirmação do servidor, inclusive depois de atualizar a página. O cadastro e a decisão são preservados; os filtros **Histórico: rejeitados** e **Histórico: removidos** permitem consultar os registros Tech. As publicações e recibos anteriores continuam no histórico do canal. A ação cancela jobs ainda na fila, sem apagar comprovantes de envios concluídos.

O painel permite ajustar fontes, categorias, termos, limites e referências em **Filtros e rotina**, inicialmente recolhido. O briefing posterior unificou o sistema em grafite, laranja e prata, substituindo o azul. Cards resumem preço registrado, score, vendas, estrelas e categoria; avaliação completa e prévia ficam recolhidas. A aprovação individual usa os mesmos critérios e observações da avaliação exibida, sem limite de um produto aprovado. Bloqueios mostram seus motivos. Busca/planejamento em simulação não criam produtos, ofertas, jobs ou recibos; a aprovação manual explícita prepara um rascunho e leva a **Próximos posts**, sem enviar. Fluxo e migração em [Painel escuro](premium-dashboard.md).

Antes do envio continuam os controles de nome/foto/preço/link, preço atual, revisão, destino, pausa e recibos incertos. O teste Telegram isolado também reavalia os critérios atuais; não permite usar um canal de produção como canal isolado. O script da postagem única anterior permanece com sua autorização consumida; não libera novos envios.

## Evidência desta entrega

- Suíte completa após o refinamento do painel: 203/203 aprovada; tipos e build aprovados. Regressões verificam exclusão de falsos positivos, aprovação de produtos distintos, avaliação com histórico e remoção dos cards com persistência após atualização. Detalhes em `VALIDACAO.md`.
- Banco remoto: 114 produtos em cache e 114 amostras iniciais reais. A última reavaliação, sem consultas Shopee, encontrou 50 produtos relacionados ao nicho e sete dentro dos critérios. Nesse snapshot havia três aprovados pelo usuário e quatro pendentes; nenhuma decisão foi alterada pelo script. As contagens podem mudar conforme a revisão manual. Relatório local: `outputs/shopee-live/quality-review.json`.
- Um triturador de alimentos foi excluído após revisão real; nenhum candidato foi aprovado automaticamente. Os filtros descartaram ofertas de nicho incompatível, poucas vendas/nota, desconto insuficiente e variantes não verificadas.
- RLS novo conferido; advisors de segurança sem novos achados em relação ao estado anterior. A mensagem 18, seis recibos e 19 eventos existentes foram preservados; WhatsApp com zero confirmações. Dispatcher e as três operações permanecem pausados, sem alteração das flags de ambiente.
- Não havia navegador conectado para inspeção visual. SSR/JSDOM validam conteúdo/interações, sem comprovar layout desktop/celular. Sem push/deploy ou novas credenciais; a Vercel ainda precisa receber este código antes de mostrar o novo painel.

`node --import tsx scripts/reassess-shopee-cache.ts` reavalia somente o cache existente com pausa obrigatória, sem chamar Shopee/Telegram, aprovar produtos ou alterar configurações. Não é um cron novo.

# Painel escuro e Próximos posts — 12/11/2026

O briefing visual desta etapa substitui a identidade azul anterior: todas as operações usam a mesma base grafite, laranja e prata. A alteração visual não habilita a busca automática dos outros grupos. O garimpo Shopee permanece restrito a Tech & Games.

## Fluxo de aprovação

1. Na Automação de Ofertas, **Aprovar** reavalia o produto com os critérios e o histórico atuais. O servidor autenticado também verifica a autorização administrativa.
2. A aprovação prepara um produto e uma oferta rascunho no catálogo e leva a **Próximos posts**. O estoque continua desconhecido; nenhum desconto anterior é inventado. A legenda inicial usa o template sem preços e sem alegações de estoque.
3. **Agendar** abre a prévia existente e o formulário de data/destino. **Publicar agora** abre a confirmação existente do Telegram. **Ver prévia** permite revisar a oferta e preparar o compartilhamento manual no WhatsApp.
4. Apenas a confirmação final executa a ação escolhida. Conferência de preço, foto, destino, histórico de duplicações, entregas incertas e autorizações de republicação continuam vigentes.

Não é necessário ativar a descoberta automática para usar esses controles manuais. Preparar/aprovar não ativa a automação dos horários: o sistema respeita a configuração operacional existente. Aprovações anteriores aparecem em Próximos posts e recebem a preparação ao abrir uma ação.

Preparações repetidas reutilizam o cadastro pelo vínculo ou URL canônica, preservando edições, ofertas ativas, histórico e horários. Produto arquivado exige restauração no catálogo. Rejeitar/remover retira o card das listas ativas e cancela jobs ainda na fila associados à curadoria ou ao produto preparado; recibos anteriores são preservados.

## Organização visual

- `src/app/workspace.css`: tokens compartilhados, campos, feedback e base escura. Retirados os temas claros diferentes por marca e as cores azuis específicas da Shopee.
- `src/app/premium.css`: composição do painel, navegação ativa, indicadores, cards, catálogo, histórico, agenda, prévias, foco e responsividade. Importado após a base em `layout.tsx`.
- Dashboard: indicadores antes do conteúdo editorial, curadoria Tech com contagens por decisão quando disponível, publicações recentes e comparação real dos canais. Sem séries ou dados financeiros fictícios.
- Curadoria: cards com nome, preço registrado, marketplace, categoria, vendas, estrelas e score; detalhes e prévia recolhidos. Filtro Gamer/Tech e histórico de rejeitados/removidos preservados.
- Catálogo: cards por padrão e alternativa em lista, filtros existentes, data do cadastro e menu com publicar, agendar, editar, histórico e arquivamento no fluxo existente.
- Agenda: hoje, próximos drops, pendentes e histórico recolhido; edição de horário, cancelamento do canal correto e abertura da confirmação de publicação imediata.
- Histórico: nome, miniatura atual do produto quando acessível, canal, status, destino e data em primeiro plano. Comprovantes, atores e detalhes secundários recolhidos; links de mensagens continuam derivados de recibos confirmados. A miniatura do catálogo não substitui a evidência/foto da mensagem histórica.

Contagens da agenda e produtos manuais de Próximos posts indicam o recorte da página atual. A curadoria aprovada é carregada separadamente pela API existente, limitada aos 200 registros mais recentes. Falha de leitura não representa zero produtos. A API não é consultada para buscar novos produtos apenas por abrir as telas.

## Banco e segurança

Migração incremental gerada pela CLI oficial: `20261112122158_shopee_next_posts.sql`. Adiciona apenas `prepared_product_id` e a função `dropou_shopee_stage(uuid,uuid,jsonb,jsonb)`. A função recebe a avaliação atual calculada pelo servidor, compara a identidade/preço/foto/link com o cache e prepara o rascunho na mesma transação da aprovação.

A RPC usa `security invoker`, acesso exclusivo de `service_role` e o mesmo lock por identidade/ordem produto–cache da fila existente. O endpoint valida sessão, operação, administrador e qualidade antes de chamá-la. Não altera RLS, cron, flags de envio, credenciais ou destinos. Não reaplicar schema/seeds ou migrações anteriores.

Aplicada ao Supabase existente nesta etapa, versão remota `20261112124511`. Teste transacional remoto de preparação repetida passou com rollback, sem criar jobs/recibos. Grants conferidos: servidor autorizado, clientes autenticados/anônimos sem execução. Advisors sem achados novos em relação à leitura anterior.

Durante a implementação, o usuário continuou operando: os logs registraram uma preparação real de mousepad e ativação da marca. A conferência posterior encontrou dispatcher/Dropou ativos e outras marcas pausadas; nenhum desses controles foi ativado ou revertido pelo agente. Flags de liberação da descoberta Shopee não foram alteradas.

## Canal de destino pendente

O destino Dropou tinha ID/nome salvos, mas `telegram_verified_at` vazio. Isso fazia `/api/publication-config` retornar indisponibilidade. A interface agora preserva a identificação conhecida do canal, explica que a permissão está pendente e oferece **Verificar canal e permissão do bot** no formulário, mantendo a confirmação bloqueada até a verificação.

Verificação real nesta tarefa: `getMe`, `getChat` e `getChatMember` confirmaram o bot administrador no canal já cadastrado. O registro de verificação foi salvo com comparação do ID para não sobrescrever uma alteração concorrente. Nenhuma mensagem foi enviada. `scripts/verify-dropou-telegram.ts` permite somente esses três métodos de leitura; não muda automação, fila ou recibos. Sessões com a janela antiga aberta precisam fechá-la e abri-la novamente para carregar a nova configuração.

## Verificação

O pedido posterior de legendas com preço, rotação local exclusiva do Dropou e botões de agendamento rápido está implementado em [Legendas Tech & Games](legendas-tech-games.md). Esse fluxo substitui o rascunho inicial sem valores do Dropou descrito na primeira etapa; regras dos demais grupos permanecem.

Os resultados finais de testes, tipos/build e revisão visual estão em `VALIDACAO.md`.

`node --import tsx scripts/review-premium.tsx` gera prévias isoladas dos componentes reais, identificadas como fixtures, em `outputs/premium-review/`. Não usa credenciais ou backend. `node tests/browser-premium.mjs` verifica essas páginas em Chrome; aceita `CHROME_PATH` e `PLAYWRIGHT_PATH` para as ferramentas já instaladas. Os scripts não instalam dependências. Essas prévias não comprovam deploy ou uma sessão autenticada real.

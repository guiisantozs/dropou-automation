# Fluxo direto de ofertas

Os produtos já cadastrados usam **Card → Conferir → Publicar oferta → Salvar / Agendar / Publicar agora**, no QuickOfferModal existente. O botão aparece fora dos menus no desktop e no celular, usando os tokens da operação ativa. Não há redirecionamento automático ao formulário por ausência de oferta ou pelo retorno `needsReview` da importação.

## Abrangência

- Consolidado e dashboards individuais: `general-dashboard.tsx` e seus cards de ofertas prontas/próximo drop.
- Catálogo atual: `catalog-workspace.tsx` e `catalog-parts.tsx`; catálogo anterior e recentes: `product-catalog.tsx` e `dashboard-overview.tsx`.
- Ofertas aprovadas, prontas e listas operacionais: `product-operations.tsx`, `next-posts.tsx` e ofertas aprovadas/elegíveis de `offer-automation.tsx`.
- Meus links Shopee: `shopee-saved-products.tsx` e a apresentação anterior `shopee-saved-products-legacy.tsx`.
- Ofertas preparadas da busca, funis, publicações e agenda: `search-offers.tsx`, `channel-funnels.tsx`, `publications-workspace.tsx` e `publication-schedule.tsx`.

As nove operações reutilizam os mesmos caminhos: Dropou, Bruto & Barato, Moda Masculina, Celulares & Gadgets, Tênis & Sneakers, Auto & Moto, Toque de Beleza, Cantinho & Charme e Clima de Natal. A curadoria mantém Aprovar/Rejeitar. Candidatos ainda não aprovados não recebem um atalho de publicação; fontes ainda não importadas ou integrações indisponíveis conservam suas restrições.

## Abertura, ações e segurança

`QuickOfferProvider` abre imediatamente o modal com a imagem/nome/preço disponíveis no card, enquanto produto e destinos são lidos em paralelo. Um link salvo ainda sem produto canônico usa o mesmo serviço idempotente de preparação dentro do carregamento do modal, sem nova consulta de marketplace. A resposta é conferida por ID e operação. O ID canônico também identifica leituras, edições, envios e bloqueios de repetição.

`needsReview` vira uma pendência no próprio modal, preservada nas atualizações até um salvamento explícito da revisão. Abrir o modal não aprova dados nem publica. Produto indisponível conhecido não pode ser transformado em disponível pelo botão Salvar. Preço, link, apresentação, destino, snapshot, estoque e recibos continuam submetidos às regras existentes. Dados incompletos ou não autorizados bloqueiam as ações correspondentes e mostram a causa.

Salvar usa o serviço existente de salvamento/revisão. Uma oferta tecnicamente válida ainda não salva é persistida pela própria ação de publicação. Agendar usa diretamente o horário exibido em America/Bahia; a chave opcional permite alterá-lo antes do clique. Publicar agora confirma o envio exibido ao Telegram, sem confirmação genérica adicional. WhatsApp continua com cópia/envio manual e confirmação real independente; não foi implementado envio automático.

Os três pontos ficam para detalhes, histórico, links, manutenção e exclusão. O formulário completo continua disponível em **Mais opções → Editar detalhes**. As notificações existentes atualizam as listas e os cards sem navegação ou recarregamento da página, preservando filtros e posição.

## Validação local

- `npm.cmd test`: 525/525, incluindo ações do modal nas nove operações, publicação com salvamento incorporado, preparação canônica, revisão pendente, estoque indisponível, canal ausente e as regressões existentes de isolamento, autenticação, agendamento, recibos e duplicidade.
- `npm.cmd run typecheck` e `npm.cmd run build`: aprovados.
- Chrome/Next compilado com APIs interceptadas: 148 layouts (consolidado e nove operações; dashboard, modal e catálogo, mais biblioteca das sete marcas Shopee; larguras 320/375/768/1440). Conferir visível, URL preservada, editor ausente no caminho normal, tema herdado e nenhum overflow horizontal/erro de página. Salvar, publicar e agendar simulados; capturas desktop/mobile inspecionadas em `outputs/direct-offer-review/` (ignorado).
- Nenhum envio real, geração paga, consulta de produto, alteração de configuração, banco, migração, push ou deploy nesta tarefa. As verificações simuladas não comprovam o envio em um canal real ainda não configurado.

## Publicação autorizada posteriormente

Após a validação local, o usuário autorizou o envio à `main` do GitHub e o deploy pelo fluxo automático já configurado na Vercel. Conferidos repositório Dropou, vínculo do projeto Vercel, sincronização com `origin/main`, diff e auditoria de arquivos versionáveis sem credenciais. Esta publicação não exige migração. Conferir o SHA efetivo, o status READY e os GETs públicos no relatório final; nenhum envio Telegram ou ativação de integração deve ser usado como teste de deploy.

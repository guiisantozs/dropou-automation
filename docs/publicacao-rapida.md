# Popup compartilhado de publicação rápida

Implementação na branch `codex/operation-dashboard-structure`, sobre `1d8e975`. O redesign posterior segue a imagem fornecida: modal central de 650 px, cabeçalho com ícone/título/subtítulo, foto de 168 × 174 px ao lado das informações, legenda diretamente editável, destinos compactos, agendamento recolhido e rodapé Salvar / Agendar / Publicar agora. No celular há rolagem interna e ações fixadas à área visível. A legenda conserva o limite real de 4.000 caracteres; o exemplo de 280 caracteres da imagem não substitui a regra existente.

## Componentes e arquivos

| Arquivo | Responsabilidade |
| --- | --- |
| `src/components/quick-offer-context.tsx` | Provider por sessão/conta, abertura imediata com os dados do card, carregamento sob demanda e outlet dentro do shell de origem. |
| `src/components/quick-offer-modal.tsx` | Componente compartilhado: edição, salvamento, Telegram, cópia/registro manual WhatsApp, agendamento inline, atualização e mensagens. |
| `src/components/quick-offer-extras.tsx` | Opções avançadas carregadas quando abertas: produto, foto, apresentação, legendas, republicação intencional, histórico e exclusão com os componentes existentes. |
| `src/lib/quick-publication.ts` | Validações compartilhadas, identidade do produto/operação, necessidade de salvar e contrato das APIs de salvamento existentes. |
| `src/app/quick-offer.css`, `src/app/layout.tsx` | Composição da referência, responsividade e importação do estilo. |
| `src/components/workspace-state.tsx`, `dashboard.tsx` | Interceptação dos cliques normais e callbacks existentes, mantendo links diretos e abertura em outra aba. |
| `general-dashboard.tsx`, `dashboard-overview.tsx`, `product-catalog.tsx`, `product-operations.tsx`, `shopee-saved-products.tsx`, `publication-schedule.tsx`, `publications-workspace.tsx` em `src/components/` | Listas e atalhos enviam os dados já disponíveis do produto ao modal. |
| `src/components/dialog.tsx` | Escape somente no diálogo superior, foco, restauração, fundo inerte e rolagem bloqueada. |
| `src/components/product-form.tsx`, `publication-photo-editor.tsx` | Aviso de edição não salva e requisição vinculada à operação do produto, inclusive quando aberto no consolidado. |
| `tests/quick-publication.test.ts`, `tests/dialog-stack.test.ts`, `tests/shopee-saved-ui.test.ts` | Regressões de contrato, segurança, canais independentes, foco e dados iniciais. |
| `scripts/check-quick-offer-live.ts`, `scripts/check-operational-workspace.ts` | QA do Next compilado com sessão/APIs fictícias e atualização do retorno ao dashboard. |

Reutilizados `Dialog`, `ProductMedia`, `MarketplaceBadge`, `ChannelMark`, `CaptionContent`, `ProductForm`, `TelegramMediaOptions`, `PublicationPhoto`, `PublicationPhotoEditor`, `PublicationHistory` e `DeleteProduct`. Nenhuma cópia desses componentes por operação.

## Herança dos temas

O outlet fica dentro do `.app-shell` que abriu a oferta. O CSS consome `--surface`, `--canvas`, `--subtle`, `--ink`, `--ink-muted`, `--border`, `--primary`, `--primary-ink`, `--primary-soft`, `--primary-border` e os tokens semânticos existentes. Não há nova tabela de paletas, laranja fixo ou mudança em `operation-theme.css`. Abrir um produto Dropou no consolidado mantém o modal claro; as chamadas usam a operação real do produto sem trocar a operação visual ativa. Tech & Games mantém azul profundo/roxo/ciano, e Celulares mantém seus próprios tokens.

## Ações e proteções

- Abrir, fechar ou alternar prévia não grava nem publica. URL, filtros, paginação e posição da lista permanecem no lugar. Fechar uma edição pendente pede confirmação. Rotas `/ofertas/[id]` continuam disponíveis diretamente.
- Salvar reutiliza `/api/offers` e, quando necessário nas operações legadas, a reconferência existente. Preço, condições e link são validados pelas regras atuais. O modal não inventa uma nova expiração temporal para a conferência.
- Uma oferta válida já salva publica sem salvamento adicional. Uma alteração pode ser salva na mesma ação; se o servidor devolver outra legenda, o envio para e pede nova revisão do texto exibido.
- Telegram usa o endpoint existente e só confirma sucesso com resposta `sent`. Agendamento reutiliza o endpoint, horários da operação e fuso America/Bahia, sem criar cron ou ativar automação. O botão Agendar abre os campos quando recolhidos e confirma o agendamento quando preenchidos. Publicar agora é uma ação imediata distinta.
- Os destinos cadastrados são selecionados individualmente. WhatsApp permanece explicitamente manual: copiar não cria recibo; confirmar publicação exige declaração separada após o envio pelo usuário. O agendamento WhatsApp continua sendo uma reserva manual.
- Lock síncrono bloqueia cliques repetidos. Solicitação iniciada com resposta incerta fica bloqueada, inclusive ao fechar/reabrir. Não há retry automático; uma nova tentativa exige falha comprovada pelo servidor e ação do usuário. Histórico, agendamentos existentes, entregas parciais/incertas, arquivamento e autorização de republicação continuam respeitados.
- Chamadas são autenticadas e vinculadas à operação. Nenhum arquivo de API, servidor, banco, RLS, integração, autenticação, dispatcher, MTProto ou extensão foi alterado nesta implementação.

## Desempenho e validação

O caminho anterior navegava à página completa e permitia prefetch de páginas de ofertas por card. Agora o card preenche imediatamente a identificação, o código do modal é carregado sob demanda e há uma leitura canônica da oferta e uma dos destinos, em paralelo. Destinos lentos não retêm a legenda nem o salvamento; publicar continua aguardando sua validação. Histórico e editor avançado carregam ao abrir. Não existe cache persistente de ofertas: respostas de gravação e atualizações autenticadas revalidam os dados, preservando edições pendentes.

Resultados finais de 16/11/2026:

- `npm.cmd test`: **334/334**; `npm.cmd run typecheck`, `npm.cmd run build` e `git diff --check` aprovados.
- Next compilado e Chrome: **28 layouts** (sete escopos × 320/375/768/1440 px), mais agendamento em desktop/celular. Sem overflow ou erros de página. Capturas do consolidado, Tech e Celulares inspecionadas contra a referência; foto, cabeçalho, campos, destinos e rodapé conferidos.
- Fluxos: oferta salva sem save forçado; editar+salvar+enviar; rascunho novo; erro sem perder edição; legenda reescrita pelo servidor; dois cliques; resposta incerta após reabrir; agenda inline; cópia e confirmação manual; link de afiliado; configurações lentas; filtros/scroll/URL; editor com marca bloqueada; diálogo de exclusão aninhado; rejeição de escopo incorreto e página antiga direta.
- Primeira identificação do card em **230 ms** com atraso sintético de 400 ms nas APIs. A página antiga completa levou 1.734 ms nessa execução. São medições locais com fixtures e carga variável, não um benchmark de produção.
- Regressões anteriores desta mesma implementação: 88 layouts das demais abas, roteiro da biblioteca e roteiro do dashboard geral aprovados antes do refinamento visual final. O refinamento final foi revalidado pelo roteiro dedicado ao modal.

Todas as escritas do navegador foram interceptadas, conexões externas bloqueadas e Realtime simulado. Os testes de banco usam fixtures locais/PGlite. Isso não comprova uma sessão produtiva, entrega real ou disponibilidade de cada destino. Não houve mensagem, consulta real de produto, geração paga, ativação, migração, merge, push desta implementação ou deploy manual. A branch/main original e os arquivos locais do experimento Mercado Livre foram preservados.

O primeiro briefing mencionava um vídeo que não estava presente entre os anexos acessíveis. A implementação visual foi comparada com a imagem posterior e com o código existente; nenhuma análise do vídeo é alegada.

Prévia visual local: `http://127.0.0.1:4197`, com opções de tema e celular. Exibe capturas demonstrativas; os botões nas imagens não executam ações. Evidências ignoradas em `outputs/quick-offer-review/` e logs `outputs/quick-offer-*.log`. Para testar com dados próprios, use esta branch em ambiente autenticado e confirme o destino antes de qualquer publicação real.

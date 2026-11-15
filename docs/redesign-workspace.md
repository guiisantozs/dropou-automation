# Painel compacto e retorno às listas

## Apresentação

- Dashboard: quatro indicadores com ícones, números maiores e atalhos. Produtos para publicar e recentes usam cards horizontais com miniatura, nome em duas linhas e preço em destaque.
- Catálogo e salvos: fotos menores e contidas, filtros em um painel, botões compactos e lixeira com nome acessível, tooltip e confirmação. O catálogo conserva arquivados e históricos; os prazos de 7 + 14 dias continuam no backend existente.
- Publicações: histórico em linhas, miniatura, plataforma, operador, data e comprovação existente. Filtros e agrupamento diário foram mantidos.
- Agendamentos: horário em destaque, leitura por dia e destino, status e ações menores. Editar/cancelar continuam exigindo confirmação; WhatsApp continua manual.
- Sidebar, cabeçalhos, botões, badges, bordas e inputs compartilham a mesma densidade. Os temas existentes são herdados: laranja nas operações gerais e turquesa somente em Celulares, incluindo o mascote existente.

`refined-workspace.css` é a camada final de apresentação. Usa as variáveis de `workspace.css` e `operation-theme.css`, sem uma paleta nova ou dependências adicionais.

## Ações e confirmação

Os ícones de Telegram e agendamento abrem os fluxos existentes; não publicam por um clique no card. O Telegram já registrado fica identificado com data e origem manual/bot. Republicação permanece explícita dentro da oferta. Copiar para WhatsApp relê a legenda salva e valida os dados antes de copiar; não cria recibos nem marca publicação.

Os controles de marcação manual ficam em “Registrar publicação manual”. Eles registram algo que o operador já fez, com texto que distingue registro de envio. Repostagens, correções e comprovantes mantêm a auditoria existente. A lixeira abre uma confirmação antes da remoção.

## Navegação e estado

`workspace-navigation.ts` constrói os caminhos de oferta e valida `returnTo`: somente caminhos relativos das páginas de workspace são aceitos. URLs externas, caminhos de API, barras invertidas e controles são recusados. Criar, abrir, editar e salvar transportam a origem. Editar a partir da prévia também transporta `back=offer`, para cancelar a edição voltando à própria oferta. O retorno legado `return=shopee-saved` continua aceito.

`WorkspaceOfferLink` usa as transições do Next. O dashboard sincroniza a aba com a URL em todos os atalhos, incluindo o evento de voltar do navegador. A confirmação OAuth é consumida uma vez, sem remover a marca selecionada nem redirecionar retornos futuros ao painel de integrações.

`WorkspaceState`/`useWorkspaceField` guardam apenas filtros, modo, arquivados e paginação em `sessionStorage`, separados por conta, operação e tela, por até 12 horas. Dados locais inválidos/expirados são ignorados; objetos não podem acrescentar parâmetros de marca às consultas. As listas principais aguardam a restauração antes da primeira consulta. Produtos, ofertas e recibos não são armazenados nesse cache.

A posição de rolagem é lembrada ao sair e restaurada depois da leitura da lista. A restauração é limitada e é cancelada se o usuário começar a rolar ou usar o teclado. Os skeletons em `WorkspaceLoading` e no segmento de ofertas mostram o carregamento; leituras subsequentes mantêm a lista visível. A lista de salvos deixou de redesenhar a cada segundo e acompanha o relógio a cada 15 segundos.

## Conferência local

```powershell
npm.cmd test
npm.cmd run typecheck
npm.cmd run build
npx.cmd tsx scripts/review-premium.tsx
npx.cmd tsx scripts/review-publication-workspace.tsx
npx.cmd tsx scripts/review-celulares-theme.tsx
npx.cmd tsx scripts/review-saved-retention.tsx
```

As prévias ficam em `outputs/premium-review/`, ignorado pelo Git. `tests/browser-premium.mjs` confere imagens, overflow, erros e cores em 320/375/768/1440 px. `PREMIUM_PAGES` escolhe os arquivos; o tema Celulares também exige `PREMIUM_PRIMARY=#00E5DD` e `PREMIUM_BACKGROUND=rgb(8, 14, 17)`.

Com o Next local em `127.0.0.1:3000`, `scripts/review-workspace-navigation.ts` confere as telas reais com conta fictícia e APIs interceptadas: catálogo → oferta → retorno com filtro/página/scroll, prévia → edição → prévia, novo cadastro e retorno de publicações/agendamentos. Bloqueia mutações e conexões externas; não testa autenticação real, acesso produtivo ou entrega de mensagens.

O ambiente local precisa das variáveis públicas Supabase para login. Rotas que fazem manutenção administrativa, publicação e integrações também dependem das credenciais privadas do servidor. Nenhum segredo é incluído nas prévias ou no Git; esta mudança não baixa segredos da produção nem altera o banco.

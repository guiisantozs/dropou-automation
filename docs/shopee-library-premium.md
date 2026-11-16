# Meus links Shopee · redesign da biblioteca

Implementação em `codex/shopee-saved-premium`, a partir do dashboard geral `2f91f44`. O worktree é `outputs/general-dashboard-worktree`; a branch experimental Mercado Livre e seu lockfile local permanecem no diretório principal. Sem merge, push ou deploy.

A referência fornecida orienta a composição: sidebar clara existente, header com logo Shopee/busca/perfil, banner preto com controle e headset, quatro indicadores, linhas horizontais compactas e coluna com destinos, horários e atividade. Manrope e logos locais são reutilizados. Somente **Dropou → Meus links Shopee** recebe a nova composição. As bibliotecas das demais operações usam o componente anterior, preservado em `shopee-saved-products-legacy.tsx`.

## Dados e ações

- O contrato de `/api/shopee/saved-products` permanece intacto. O frontend lê suas páginas antes de calcular totais, pesquisar e filtrar toda a biblioteca; a apresentação continua paginada em 24. Se os registros mudarem durante a leitura, não expõe um total parcial como completo: conserva a coleção anterior e pede atualização. Isso aumenta as leituras em bibliotecas grandes; não acrescenta consultas externas de produtos. Uma leitura paginada não equivale a um snapshot transacional do banco.
- Os quatro indicadores se referem **à biblioteca salva atual**, não a todos os produtos/históricos da conta. Salvos usa o total da API; prontos exige oferta conferida disponível para envio imediato, sem entrega incerta/agendamento pendente; postados hoje conta uma vez cada produto com evidência Telegram ou confirmação WhatsApp na data Bahia; links conta salvos com link afiliado disponível. Não representa um contador histórico de conversões. Percentual pronto usa esse mesmo universo; comparações semanais não são inventadas.
- Todos/Prontos/Postados/Em curadoria são filtros locais da coleção carregada. O último reúne itens ainda não publicados e indisponíveis para envio imediato; o status específico continua explícito, inclusive agendamento/pendência. Essa organização não modifica a decisão da curadoria automática. Busca ignora acentos e ordenação lista os salvos por criação. Lista/grade usam a mesma coleção e as mesmas ações.
- Destinos e horários vêm do `GET /api/operations` existente, selecionando somente a operação atual. Sem número fictício de membros ou busca de “melhores horários”. Editar/menus abrem a configuração existente. Não usa o GET de configuração que pode verificar o bot automaticamente.
- A atividade mostra criação do salvo e publicações com data comprovada; não apresenta o horário futuro de um agendamento como data da ação de agendar. Cópia WhatsApp efetuada nesta tela aparece apenas em memória, explicitamente “nesta sessão”; não altera histórico, KPIs de publicados ou recibos.
- Salvar produtos abre o importador existente (50 links, lotes de cinco, mesmos limites). Atualizar lista só relê os registros; Buscar/Atualizar dados conserva a consulta explícita pela API original. Nenhum endpoint novo.
- Nome do produto abre a conferência. Telegram abre a confirmação existente; a cópia WhatsApp relê a oferta autenticada antes de copiar a legenda salva. Agendar abre/prepara o fluxo existente; abrir não envia nem agenda. Entregas incertas e agendamentos continuam bloqueando repetição. O pequeno marcador de salvo abre a confirmação de exclusão existente; não simula favoritos persistidos.
- Avatar usa iniciais, sem inventar foto pessoal. Notificações abrem a atividade, sem sinalizar uma contagem fictícia de não lidas. Ausência/falha de foto usa fallback; falha de dados permanece consultável no menu.

## Arquivos principais

`src/components/shopee-saved-products.tsx` contém composição, componentes do banner/indicadores/widgets e ações preservadas. `src/components/shopee-library-header.tsx` contém a busca controlada. `src/lib/shopee-library.ts` reúne leitura/filtragem/indicadores. `src/app/shopee-library.css` limita estilos à nova tela. Integrações pontuais em dashboard/sidebar/layout, sem mudanças em APIs, servidor, banco, migrations, cron, MTProto ou extensão Mercado Livre.

## Asset do banner

Arquivo usado: `public/images/shopee-gaming-hero.webp` (900×507, alfa, aproximadamente 59 KB). Gerado com a skill `imagegen`, ferramenta integrada; original preservado na pasta padrão de imagens geradas, fora do Git. Conversão/compressão local com Sharp, sem nova dependência. É uma composição decorativa; fotos de produtos continuam vindo dos registros existentes.

Prompt final da ferramenta integrada:

> Use case: product-mockup. Asset type: decorative product composition for the black hero banner of a premium gaming ecommerce SaaS dashboard. Create a photorealistic premium black game controller and black over-ear gaming headset with restrained orange trim, arranged together on a low matte charcoal geometric display plinth. Three-quarter front view, controller on left foreground, headset slightly taller on right. Compact wide composition, entire objects visible, softly lit studio product photography with natural material detail and subtle edge lighting. Genuine transparent background, no setting, no lettering, no logos, no brand marks, no watermark. Intended displayed size around 340x190 pixels; clear recognizable silhouette. Do not include any UI or text.

## Visualização e validação

Prévia visual local: `http://127.0.0.1:4195`, com dados demonstrativos. `/empty` e `/pending` exibem os estados vazio e consulta pendente. É uma prévia visual estática; ações de aplicação foram exercitadas separadamente no Next com APIs interceptadas. Nenhuma dessas capturas comprova sessão produtiva ou totais remotos.

Gerar fixtures: `node --import tsx scripts/review-shopee-library.tsx`. Capturas e JSON ficam ignorados em `outputs/shopee-library-review`. `scripts/check-shopee-library.mjs` verifica 24 combinações (preenchido/vazio/pendente × 320/375/600/768/1024/1200/1440/1920). `scripts/check-shopee-library-live.ts` exercita o Next real com sessão fictícia, APIs interceptadas e conexões externas bloqueadas. Os caminhos de Chrome/Playwright podem ser ajustados ao ambiente.

Suíte completa: 327/327 testes. Regressões finais direcionadas: 8/8. Typecheck e build de produção aprovados. Navegador: busca global, filtros, lista/grade, cópia com releitura/recusa após perda da conferência, modal/Escape, importação e exclusão simuladas, paginação restaurada, erro/recuperação, navegação e isolamento de Celulares. Apenas duas escritas simuladas nesse roteiro (salvar link/excluir); nenhuma chamada externa ou envio. Capturas desktop/mobile inspecionadas e sem overflow, invasão da foto ou imagem quebrada.

As dependências locais do worktree são reutilizadas por junction. O build foi executado com raiz Turbopack temporária para essa estrutura Windows; configuração específica da máquina removida antes da entrega. Não houve alteração remota de credenciais, dados, destinos, limites, flags, rotinas, provider de produtos ou publicações.

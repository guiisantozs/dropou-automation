# Estrutura das abas e entrega na main

O usuário autorizou estender a estrutura compacta às demais abas, integrar o trabalho na main e enviar ao GitHub após a validação. Essa autorização substitui a restrição de não integrar/publicar registrada nas rodadas visuais anteriores. A branch experimental Mercado Livre não faz parte desta entrega.

## Apresentação

- Dashboard geral de Todas as operações e biblioteca Dropou preservam a composição clara aprovada. As demais abas usam a mesma navegação agrupada, sidebar arredondada, cabeçalho compacto, fonte Manrope local e cards proporcionais, com preto/grafite e laranja.
- Celulares & Gadgets conserva preto azulado, ciano `#00E5DD`, nomes/contexto do canal e mascote existentes. Botões, campos, foco, preços e indicadores herdam a paleta da operação.
- Curadoria, catálogo e produtos prontos recebem linhas horizontais; fotos permanecem contidas. Agenda, publicações, busca, consumo, atividade e configurações compartilham espaçamentos e bordas. Cadastro e oferta recebem a mesma tipografia/acabamento.
- A biblioteca compacta passa também a Celulares, Tênis e Auto & Moto. A seleção de marca continua vinculada às requisições. Celulares usa seu mascote; a composição gamer fica restrita a Tech & Games. Nenhum produto/estatística de exemplo entra no sistema real.
- `workspace-page-header.tsx` reutiliza as ações existentes: criar, abrir catálogo, atividade, configurações e sair. A sidebar existente é reutilizada; os menus continuam disponíveis. Na busca, as chaves de componentes irmãos foram diferenciadas para eliminar um aviso React de identidade duplicada observado na revisão.

## Arquivos e limites

Camada principal: `src/app/operational-workspace.css`, `src/components/workspace-page-header.tsx`, integrações em `dashboard.tsx`, `offer-workspace.tsx`, `shopee-saved-products.tsx` e `layout.tsx`. Os fluxos de salvar/conferir/publicar/agendar e as APIs dessas operações permanecem os existentes. Sem alteração incremental de schema, RLS, migração, cron, MTProto, extensão Mercado Livre, cotas, destinos ou credenciais nesta extensão visual. A primeira rodada do dashboard geral já havia acrescentado seu agregado autenticado de leitura; ele acompanha esta entrega.

Telegram ainda exige confirmação e recibo real. WhatsApp continua manual. Copiar não cria uma publicação. Repetição, entrega incerta, agendamento existente, proprietário e operação seguem protegidos. Testes não autorizaram mensagens reais, geração paga ou ativação de rotinas.

## Validação

- Suíte completa local: **327/327** testes, incluindo banco PGlite, contexto/canais, revisão, cópia, agenda, histórico, incerteza e orçamento. Tipos e build de produção aprovados. Nenhuma dependência de produção adicionada.
- `scripts/check-operational-workspace.ts`: **88 combinações** no Next real (11 abas × Tech/Celulares × 320/375/768/1440 px). Paleta, sidebar, largura das linhas e overflow verificados; capturas desktop/mobile inspecionadas. Verificações adicionais de Bruto, Moda, Tênis e Auto & Moto.
- Cliques no cabeçalho/sidebar, filtro do catálogo, aprovação/rejeição, edição/cancelamento de horário, confirmação manual WhatsApp, período das publicações e salvamento de configurações exercitados com APIs interceptadas. O roteiro faz seis gravações simuladas; nenhuma chega ao banco. Cópia relê a oferta; atalhos de Telegram/agendamento só abrem a confirmação.
- Regressões dos roteiros da biblioteca e dashboard geral também aprovadas: busca global, paginação/retorno, estados de erro, conferência para cópia, gráficos, seletor e Escape. WebSockets Realtime dos roteiros são simulados, e requisições externas HTTP ficam bloqueadas.
- Uma repetição de captura excedeu o prazo durante execução concorrente da suíte; passou depois de liberar CPU e ajustar o tempo da captura. Dois parâmetros sem anotação no script de QA foram corrigidos após o typecheck, sem alterar regras do aplicativo.
- Evidências locais ignoradas: `outputs/operational-workspace-review`, `outputs/shopee-library-review` e `outputs/general-dashboard-review`. Sessões/dados usados são fictícios; isso não comprova sessão produtiva ou todos os serviços externos funcionando. Leituras públicas após a publicação são registradas separadamente.

O worktree reutiliza dependências por junction Windows; a raiz Turbopack temporária de QA não é entregue. A integração deve ser fast-forward sobre a main conferida, seguida de comparação do SHA remoto. O arquivo local não versionado e a branch experimental devem permanecer preservados.

Integração local concluída em `d08a0e1`: main avançada de `ec04a14` sem conflito. Tipos e build foram repetidos no diretório principal e aprovados. Branch experimental e conteúdo do lockfile local preservados; índice principal auditado sem credenciais conhecidas ou artefatos privados. A confirmação do envio/deploy é uma etapa distinta dos testes locais acima.

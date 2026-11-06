# Redesign e conferência opcional

Registro da revisão local de 6 de novembro de 2026. Após essa revisão, o usuário autorizou a implantação do código e do banco; a migração `20261106191236_optional_price_publication` foi aplicada e verificada. Veja o [registro de release](release-redesign-2026-11-06.md). As seções de implantação abaixo descrevem o estado anterior à autorização.

A apresentação visual foi posteriormente substituída pela [nova referência do Dropou](redesign-nova-referencia.md). As informações funcionais e a proposta de SQL descritas aqui continuam válidas; as medições abaixo registram a versão visual anterior.

## O que mudou

A interface usa azul como cor principal, superfícies brancas, fundo em tons de slate e cores semânticas para sucesso, alerta e erro. Sidebar, dashboard, catálogo, formulários, prévia, publicação e agendamento compartilham controles, espaçamentos, foco visível e estados vazios. As regras de layout contemplam desktop e telas pequenas, com redução de movimentos conforme a preferência do sistema.

O seletor mantém **Dropou Games & Tech** como operação ativa. **Bruto & Barato — Ferramentas** e **Moda Masculina** abrem somente apresentações de preparação. Não criam produtos, filas, integrações nem marcas de IA. As métricas do dashboard continuam usando as fontes existentes, sem números fictícios na aplicação.

## Conferência e publicação

- **Conferi agora:** salva a conferência no backend e incorpora produto, oferta e horário retornados em uma atualização da tela. A validade continua em 15 minutos. Respostas antigas não substituem uma conferência mais recente. A contagem usa uma âncora do servidor e tempo decorrido, sem depender do fuso ou de alterações no relógio do navegador.
- **Continuar sem conferir:** usa um texto local determinístico com nome, link e convite para consultar as condições na loja. Não inclui preço histórico, desconto, parcelamento ou alegações de estoque. Nomes contendo alegações comerciais recebem uma descrição genérica. Não chama a OpenAI.
- A legenda original e a edição promocional permanecem preservadas. A prévia mostra exatamente a versão escolhida para publicação. Edições não permitem inserir valores na versão sem conferência.
- Telegram exige confirmação explícita e mostra texto e canal de destino. A versão sem valores envia texto e link, sem a imagem que poderia conter um preço antigo.
- WhatsApp continua manual: preparar/compartilhar não registra entrega. O registro exige destino e confirmação de publicação efetiva. A interface mantém recursos de texto, link e imagem, com orientação para evitar imagens com preços não conferidos.
- Um agendamento novo pode autorizar explicitamente a versão sem valores caso a conferência expire. O texto efetivamente escolhido fica registrado. Agendamentos antigos não recebem essa autorização automaticamente. WhatsApp agendado gera uma tarefa de preparação.
- Pausa global, autenticação, vínculo ao produto, canal configurado, deduplicação e tratamento de entrega incerta permanecem exigidos. A adaptação de um agendamento ocorre antes da primeira requisição externa; não cria tentativa automática após falha de rede ou entrega parcial.

A leitura diagnóstica encontrou conferências persistidas com horário UTC correto. Não foi demonstrado um erro de fuso no banco. A correção aborda bloqueios acoplados à conferência e a possibilidade de estado duplicado ou resposta antiga na interface; o teste isolado também cobre recarga e horário da Bahia.

## Banco e implantação pendentes

[optional-price-publication.sql](../supabase/optional-price-publication.sql) é uma **proposta local**, testada em PGlite. Não foi aplicada ao Supabase nem adicionada ao histórico de migrações executadas. Ela acrescenta os campos de modo, legenda de origem e autorização de alternativa nas tabelas existentes, além das funções de validação, fila, registro manual e escolha do texto antes do envio. Não cria tabelas, cron, políticas de acesso ou integrações. Mantém funções com `security invoker`, permissões específicas e RLS existente.

**A aplicação atualizada e esse SQL precisam de uma implantação coordenada e autorizada.** As rotas locais usam novas funções de publicação; sem elas, retornam uma mensagem de versão não instalada. Não implantar apenas o frontend/API esperando que o banco antigo aceite o novo fluxo.

Não houve push, deployment, alteração de automação, chamada paga de IA ou publicação real nesta entrega. Chaves e `.env.local` não foram alterados. Dependências, modelos, prompts, OCR, cache e orçamento da IA não foram modificados.

## Validação

- `npm test`: **109 testes passaram**, sem falhas. Inclui atualização imediata após conferência, resposta desatualizada, persistência, validade/fuso, versão sem valores, edição, destinos, duplicidade, pausa, entrega incerta e SQL em banco isolado. Os testes antigos de bloqueio obrigatório foram ajustados à nova regra opcional; o esquema anterior continua coberto pelos testes existentes.
- `npm run typecheck`: passou.
- `npm run build`: compilação de produção concluída.
- Nenhuma dependência nova.

Não havia navegador conectado disponível nesta sessão. Portanto, não foram produzidos screenshots, Lighthouse ou validação visual real em desktop/mobile. Clipboard, compartilhamento nativo e aparência final em navegadores continuam como verificação manual antes da implantação.

## Prévia de revisão

Abra [a prévia HTML local](review/redesign.html). Ela usa os componentes reais renderizados estaticamente com exemplos fictícios identificados, controles desativados e sem chamadas de rede. Serve para revisar a apresentação; não substitui teste do fluxo interativo nem representa dados reais.

Para regenerar: `npx tsx scripts/render-design-review.ts`.

## Medições

Comparação de assets iniciais públicos da produção anterior com o build local, sem executar JavaScript remoto. O gzip foi recalculado pelo mesmo método; não é uma medição de transferência no navegador. Valores completos e método: [redesign-assets.json](redesign-assets.json).

| Assets iniciais | Antes, gzip | Depois, gzip |
| --- | ---: | ---: |
| JavaScript | 288.170 bytes | 289.071 bytes |
| CSS | 11.456 bytes | 9.234 bytes |
| Total | 299.626 bytes | 298.305 bytes |

O CSS caiu cerca de 19%; o JavaScript aumentou 901 bytes. O conjunto caiu cerca de 0,44%. Isso não comprova melhora de velocidade percebida.

O cenário local de dez aberturas/fechamentos do formulário registrou 61 commits React antes e depois, com 10 adições e 10 remoções do listener de colagem, nenhum listener residual e nenhuma requisição ou decodificação de imagem nesse cenário. O tempo amostral do Profiler foi de 589 para 550 ms; uma execução em jsdom não permite concluir ganho estatístico ou de latência real. Dados: [antes](redesign-performance-before.json) e [depois](redesign-performance-after.json).

A consolidação dos estilos remove duplicação entre o CSS global e o CSS do workspace. O histórico é carregado sob demanda e reaproveitado até uma mutação. Essas medidas não alteram consultas, integrações ou a política de geração da IA.

# Redesign pela nova referência do Dropou

Revisão local de 6 de novembro de 2026. A imagem mais recente, com o mascote do Dropou, é a referência principal e substitui a direção visual anterior.

Após a revisão, o usuário autorizou a publicação deste visual junto com a conferência opcional e a atualização do banco. A migração foi aplicada; veja o [registro de release](release-redesign-2026-11-06.md). O restante deste documento registra a etapa de preparação local.

## Composição aplicada

- Sidebar em duas camadas: faixa estreita azul e painel azul escuro, com o mesmo conjunto de ações e destinos existentes. A operação Dropou permanece ativa; Bruto & Barato e Moda Masculina continuam como apresentações em preparação, sem novas integrações ou dados.
- Banner azul com boas-vindas, botão para criar oferta e mascote decorativo em SVG. O desenho é vetorial, estático e incluído no componente, sem downloads, biblioteca gráfica ou chamadas de geração.
- Quatro indicadores alinhados no desktop amplo, com números das fontes existentes. Em telas menores, reorganizam-se em duas colunas.
- Produtos recentes em linhas compactas, com miniatura, preço registrado, status e abertura da oferta. O catálogo completo mantém filtros, importação e modos de visualização existentes.
- Coluna lateral com agendamentos disponíveis, ofertas salvas para preparar no WhatsApp e atividades disponíveis. Não há dados fictícios nem novas requisições para preencher esses blocos. O histórico continua com seu carregamento existente; quando indisponível no dashboard, aparece um estado vazio e acesso ao histórico.
- Tokens compartilhados mantêm a identidade no catálogo, cadastro, editor, prévia, publicação, agendamento e configurações. O desktop usa múltiplas colunas; tablet e celular reorganizam os blocos e usam navegação compacta. Foco visível e redução de movimento permanecem disponíveis.

Os blocos derivados dos produtos carregados identificam o escopo da página atual. Eles não representam uma consulta global de agendamentos. As métricas globais continuam usando o resumo existente. Preparar o WhatsApp abre o fluxo existente; não copia ou publica uma legenda automaticamente.

## Escopo preservado

Esta etapa alterou apresentação e composição de componentes. Não alterou endpoints, consultas do backend, banco, autenticação, integrações, preços, cache, modelos, prompts ou regras de publicação. Não foram instaladas dependências.

As alterações funcionais da etapa anterior de conferência opcional continuam locais, com sua proposta de SQL ainda pendente. Esta revisão visual não aplica nem autoriza aquele SQL. Não houve commit, push, deployment, publicação real, ativação de automação ou chamada paga nesta etapa.

## Revisão local

A prévia está em [review/redesign.html](review/redesign.html). Abra o arquivo pelo navegador, usando **Ctrl+O** se o editor mostrar apenas o código. O HTML é offline e usa componentes reais em estados vazios, sem conexão com sua conta e sem produtos ou preços inventados. Somente a navegação entre seções funciona nesse arquivo; os controles operacionais estão desativados.

Para regenerar a prévia: `node --import tsx scripts/render-design-review.ts`.

Não havia navegador conectado às ferramentas de inspeção. Portanto, não há capturas desktop/mobile ou validação visual automatizada real. A compilação e a renderização estática foram verificadas; responsividade e ações nativas ainda precisam de revisão em navegador antes da implantação.

## Verificações

- `npm test`: **109 testes passaram**, sem falhas.
- `npm run typecheck`: passou.
- `npm run build`: passou.
- `git diff --check`: passou.

Comparação dos assets iniciais com o build local da etapa anterior, com gzip recalculado pelo mesmo método:

| Assets | Antes, gzip | Depois, gzip |
| --- | ---: | ---: |
| JavaScript | 289.071 bytes | 292.380 bytes |
| CSS | 9.234 bytes | 11.256 bytes |
| Total | 298.305 bytes | 303.636 bytes |

O acréscimo total é de 5.331 bytes, cerca de 1,8%. Não é uma medição de transferência ou velocidade percebida no navegador. Dados completos: [reference-assets.json](reference-assets.json).

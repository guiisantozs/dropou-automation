# Lixeira animada

A exclusão de produtos usa um controle compartilhado em `src/components/delete-button.tsx`, com estilos em `src/app/delete-button.css`. A animação fornecida foi adaptada para SVG/CSS: tampa articulada, corpo recolhido e painel de confirmar/cancelar, com as cores da operação atual e sem dependência adicional.

Aplicado ao catálogo atual e legado, produtos salvos, listas operacionais e às telas de produto/revisão que reutilizam `DeleteProduct`. Links recebidos também usam a confirmação animada. Restaurar continua sendo uma ação distinta.

Quando há informações de histórico, arquivos ou agendamentos para conferir, a primeira lixeira abre a confirmação existente. O painel animado executa a confirmação final. Arquivamento com histórico, autorização para cancelar agendamentos, envio em andamento e mensagens de erro conservam as regras existentes do servidor. Nenhum backend, integração de afiliados, transporte, cron ou schema foi alterado.

O componente aguarda a resposta da ação, bloqueia cliques repetidos e permite repetir uma falha explicitamente. Não mostra sucesso antecipado. Escape/cancelar preservam o produto; o foco volta após a atualização do botão. A preferência de reduzir movimento desativa transições/animações, mantendo os controles disponíveis.

O roteiro `scripts/review-delete-ui.ts` usa componentes/CSS reais com requisições fictícias e tráfego externo bloqueado. Capturas e relatórios ficam em `outputs/delete-ui-visual/`, ignorado pelo Git. Não usar exclusões reais como teste de publicação.

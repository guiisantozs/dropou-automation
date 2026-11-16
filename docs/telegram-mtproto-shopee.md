# Identificação Shopee em mensagens MTProto — fila de teste

Registro da etapa 2. A evolução posterior, que consulta a API oficial para obter nosso link afiliado, está no [guia da etapa 3](telegram-mtproto-affiliate.md). As afirmações abaixo sobre ausência de consultas/conversões descrevem os testes desta etapa anterior.

Esta etapa identifica produtos por links em mensagens novas de uma fonte controlada. Reutiliza a sessão e o diagnóstico de dez minutos já existentes. Não cadastra produtos, não prepara ofertas, não gera links afiliados e não publica. Nenhuma migração, dependência ou variável de ambiente nova.

## Fluxo e privacidade

1. No painel Conexões Telegram, o administrador escolhe uma fonte administrada, confirma o controle e inicia a janela existente.
2. O adaptador GramJS encaminha os metadados da mensagem. Texto com prévia de link continua sendo texto; foto com legenda é `photo`. Mensagens privadas, protegidas/temporárias, fontes diferentes e mensagens fora da janela continuam descartadas.
3. A extração de URLs só acontece sob demanda, depois de o banco aceitar o diagnóstico com a lease e a janela atuais. São examinados texto/legenda e entidades URL/TextURL do Telegram, com offsets UTF-16. Corpos, legendas, remetentes, imagens e prévias não são copiados para a fila ou banco. Nenhuma mídia é baixada.
4. Links diretos identificam `shopId` e `itemId` localmente. Links curtos usam o resolvedor de HEAD já existente, envolvido por um adaptador exclusivo desta etapa para reconhecer o redirecionamento oficial `/opaanlp/loja/produto` observado no teste real. O importador de links Shopee existente não foi alterado.
5. O worker consulta somente `products` do proprietário e marca atuais, por URL canônica, slug Shopee ou identidade de origem. Retorna apenas ID local, nome e indicação de arquivamento. Falha de banco é diferente de produto ausente. Não há consulta à API Shopee, cache de ofertas ou importação automática.
6. O painel lê a fila pelo mesmo backend autenticado. Itens mostram mensagem/tipo/horários, IDs Shopee, presença no catálogo e erro seguro quando necessário. Nenhum botão aprova ou publica o candidato.

A fila funciona somente em Dropou nesta etapa. Outras marcas continuam usando as conexões MTProto anteriores, sem esse processamento. Owner e marca fazem parte do escopo interno da fila e da consulta do catálogo; a leitura não cria registros de conexão. Autenticação, códigos/2FA e criptografia da sessão permanecem no fluxo anterior.

## Links afiliados e identidade do produto

O link afiliado enviado pelo usuário pode redirecionar para uma rota de produto da Shopee. Resolver esse destino para ler IDs não gera outro link afiliado. A mensagem original não é editada. A fila utiliza uma referência canônica `https://shopee.com.br/product/loja/produto` sem carregar parâmetros de rastreamento. Essa referência não é prova de afiliação/comissão nem substitui URLs do catálogo ou da mensagem.

Sem cadastro local, a interface mostra **identificado pelos IDs** e informa que nome/disponibilidade não foram consultados. Não é possível afirmar por esse parsing que o anúncio está disponível ou que dados comerciais estão atualizados. Quando existe cadastro local, o nome vem desse cadastro, nunca da legenda recebida.

## Limites e duração

- Até cinco URLs por mensagem, 50 itens por janela, 200 IDs de mensagem deduplicados e dez links curtos distintos resolvidos por janela. Texto examinado limitado a 16.384 unidades UTF-16 e cem entidades.
- Até três requisições HEAD por resolução, com timeout de cinco segundos cada, redirecionamento manual e somente os hosts Shopee já permitidos. Não há scraping, cookies, leitura de HTML, ingresso em canais, bypass de bloqueios ou retries automáticos.
- URLs equivalentes na mesma mensagem são deduplicadas. Repetição do mesmo evento não cria outro item. Mensagens diferentes com o mesmo produto ficam identificadas como repetição no teste, reutilizando resolução e consulta local em memória.
- Somente uma resolução é processada por vez em cada janela. Encerrar/substituir a janela ou perder a lease impede que resultados pendentes preencham a fila antiga.
- Fila em memória por até uma hora, com limpeza no ciclo do worker (até mais 15 segundos) e nas leituras. Reiniciar o worker apaga a fila; não existe replay de mensagens. **Encerrar e limpar diagnóstico**, trocar a seleção ou desconectar também limpa a fila correspondente. A expiração natural da janela para a ingestão, preservando a fila temporária até sua limpeza/expiração.

Essa retenção temporária é intencional para comprovar identificação sem criar um histórico de conversas. Uma fila durável/revisão para publicação exige outra etapa e autorização.

## Teste local real

1. Manter uma única instância de `npm.cmd run worker:telegram` e o Next local (`npm.cmd run dev -- --port 3000`). Não reaplicar a migração MTProto já instalada.
2. Abrir `http://127.0.0.1:3000/?brand=dropou&view=telegram-connections` e confirmar conta conectada e worker online.
3. Iniciar a janela na fonte controlada. Publicar manualmente um texto com URL completa e uma foto de teste com link curto na legenda, depois do início. Não encerrar/reiniciar a janela entre os envios.
4. Conferir os dois itens em **Ofertas Shopee · fila de teste**, incluindo IDs e catálogo. Um link curto que não entregue redirecionamento permitido deve exibir erro, sem tentativas de contornar a resposta.
5. Depois da conferência, encerrar e limpar o diagnóstico. Isso mantém a conta conectada e apaga os dados temporários do teste; não remove produtos ou sessões.

## Validação e erros encontrados

Testes automatizados cobrem texto/legenda, entidades ocultas/emoji, prévia de link, URLs maliciosas/malformadas, formatos comuns/curtos, redirecionamento afiliado `opaanlp`, limites/cache, catálogo presente/ausente/falho, isolamento, fencing, expiração, interrupção e interface. O QA de navegador usa sessão fictícia/APIs interceptadas e não equivale a mensagens reais.

No teste real inicial, texto com prévia automática foi classificado como `other` e não passou pelo filtro de texto/foto; a classificação foi corrigida e recebeu regressão. Em seguida, o texto com URL completa foi identificado e encontrado no catálogo. A foto com link afiliado chegou, mas seu HEAD retornou uma rota `/opaanlp/...` ainda não reconhecida: o adaptador isolado foi corrigido e uma consulta HEAD real confirmou os mesmos IDs, sem buscar a página do produto.

Resultados finais e comandos de validação efetivamente executados ficam registrados em `VALIDACAO.md`. Logs automatizados/fixtures locais em `outputs/telegram-mtproto/shopee-identification`, ignorados. Não guardar ali códigos, sessão, legendas, imagens ou parâmetros afiliados reais.

### Resultado real após as correções

O texto com URL completa foi identificado e encontrado no catálogo da marca. Depois de carregar a correção de redirecionamento, uma nova foto com o mesmo link curto afiliado na legenda foi identificada com os mesmos IDs de loja/produto e o mesmo registro local; o usuário confirmou a fila pela captura do painel. As duas confirmações ocorreram em janelas diferentes por causa do recarregamento necessário à correção, sem reprocessar as mensagens antigas.

Tempos observados até o diagnóstico: aproximadamente 0,67 s para o texto e 1,21 s para a foto final. O tempo da fila também inclui resolução e leitura do catálogo, e o painel atualiza a cada cinco segundos. O timestamp Telegram tem resolução de segundos; esses valores não são uma medição precisa de latência da rede.

Conta e worker permaneceram conectados nas verificações, sem erro de conexão ou duplicações observadas. Ao finalizar, a janela foi encerrada, a fila e os diagnósticos foram limpos e a sessão permaneceu conectada. Nenhuma consulta à API Shopee, geração de link afiliado, cadastro/publicação automática, migração ou deploy foi feita nesta etapa.

Na conferência desta execução, o worker permaneceu ativo como PID **21096** e o Next local como PID **19932**. Os PIDs são temporários: para encerrar esta execução no PowerShell, `Stop-Process -Id 21096` encerra o worker e `Stop-Process -Id 19932` encerra este Next. Prefira Ctrl+C nos respectivos terminais quando disponíveis. Não use os PIDs antigos registrados nas etapas anteriores; confira os processos antes de reutilizar esses comandos em outro dia. No encerramento forçado, a lease expira em até 30 segundos.

Referências: [entidades Telegram e UTF-16](https://core.telegram.org/api/entities), [atualizações Telegram](https://core.telegram.org/api/updates). O suporte à rota `opaanlp` baseia-se no redirecionamento oficial efetivamente observado no teste; não presume disponibilidade de qualquer anúncio.

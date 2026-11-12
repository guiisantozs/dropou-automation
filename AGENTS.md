# Dropou Automação

Este repositório é o Dropou, em `C:\Users\Usuario\Documents\dropou-automation`, e não o site Floresce Conquista. Confirme projeto, branch e alterações locais antes de trabalhar.

- Next.js, React e TypeScript; Supabase Auth/Postgres/RLS. Validar com `npm.cmd test`, `npm.cmd run typecheck` e `npm.cmd run build`.
- `src/lib/workspace-brands.ts` define Dropou, Bruto & Barato e Moda Masculina. Preserve isolamento por proprietário/marca, destinos e históricos por canal.
- Autentique rotas com `sessionDb`. Escritas privilegiadas exigem também `publicationAdmin`; credenciais nunca recebem prefixo `NEXT_PUBLIC_`.
- O agendador existente é um único pg_cron `dropou-telegram-dispatch` a cada minuto, autenticando `/api/telegram/dispatch`. Reutilize-o; não crie um cron Vercel duplicado.
- Telegram e WhatsApp são independentes. WhatsApp permanece manual. Entregas incertas/parciais não podem ser repetidas automaticamente.
- Migrações são incrementais. Não reaplique o schema inicial no Supabase existente. Gere arquivos com a CLI oficial e teste o SQL em PGlite; diferencie testes locais de verificação remota.
- Não publique ofertas, ative rotinas, gere conteúdo pago nem exponha credenciais como consequência de testes. Preserve os controles explícitos de liberação existentes.
- Documente alterações e a validação realmente executada. Nunca copie senhas, tokens ou dados pessoais para logs/documentação.

## 2026-11-11 · Shopee Tech & Games

- Base conferida e sincronizada com GitHub em `2a95200`, sem alterações locais antes desta tarefa.
- Acrescentados `src/lib/shopee-automation.ts`, `src/server/shopee/`, rotas `src/app/api/shopee/`, painel `offer-automation.tsx` e migração `20261111190838_shopee_offer_automation.sql`; integrações pontuais no dashboard, dispatcher e textos de diagnóstico. Documentação em `docs/shopee-automation.md`.
- Cache/orçamento/rodadas são novos; produtos, ofertas, fila, recibos, histórico e republicações reutilizam as estruturas existentes. Nenhuma dependência de produção nova.
- Apenas Dropou executa a nova integração. Padrão: rotina desativada, simulação, aprovação individual e teto de oito requisições por grupo/dez globais. Horários 09:00/12:30/16:30/20:30 em America/Bahia. Credenciais e liberação real ficam no servidor.
- 190/190 testes, verificação de tipos, build de produção e `git diff --check` aprovados. As novas APIs/dispatcher recusaram acesso sem sessão em teste HTTP local. Detalhes em `VALIDACAO.md`. Nenhuma autenticação Shopee, migração remota ou mensagem real foi executada. Inspeção visual em navegador conectado continua pendente; a prévia estática usa fixtures.
- Consulta remota somente de leitura confirmou o cron existente e as três operações/dispatcher pausados nesta data. Sem push/deploy nesta tarefa.

## 2026-11-11 · Configuração local autorizada

- App ID e Secret Shopee fornecidos pelo usuário gravados somente em `.env.local`, ignorado pelo Git. Nenhum valor privado foi registrado aqui ou em `.env.example`.
- Acesso à integração marcado como autorizado; limite global local de dez requisições/dia. Postagens reais e envio de teste Telegram continuam desativados.
- URL pública do mesmo projeto Supabase preenchida a partir do exemplo existente. Demais configurações/credenciais locais preservadas.
- Validação: carregamento das variáveis pelo mesmo parser Next.js e conferência de exclusão do Git. Nenhuma consulta Shopee, migração, postagem, deploy ou cadastro de variáveis na Vercel executado nesta configuração.
- ID do canal Dropou recuperado por leitura do cadastro existente e salvo localmente. A chave privilegiada e o token faltavam nesta conferência inicial; foram preenchidos posteriormente, conforme validação abaixo.

## 2026-11-12 · API real e primeiras ofertas

- Projeto Dropou existente confirmado. As duas migrações incrementais aplicadas em 11/11 foram conferidas remotamente hoje: `shopee_offer_automation` (`20261111201300`) e `shopee_request_completion_clock` (`20261111202006`). Arquivos locais conservam timestamps da geração pela CLI. Não reaplicar migrations/schema/seeds gerais.
- `src/server/shopee/client.ts`/`engine.ts`: erro GraphQL HTTP 200/10000 classificado como provedor transitório. Conclusão idempotente e cooldown usam relógio do banco pela nova RPC. Consulta individual segue a forma sem ordenação validada na API. Regressões em `tests/shopee*.test.ts`.
- `scripts/verify-shopee.ts`: sondagens com reserva no orçamento existente, sem aprovar candidatos, habilitar rotinas, criar ofertas/fila/recibos ou enviar Telegram. Relatórios datados em `outputs/shopee-live/` (ignorado), sem sobrescrever sondagens. Sem credenciais nos logs.
- Autenticação real confirmada por consultas gerais e IDs; introspecção oficial confirmou parâmetros. Palavras-chave/categoria continuam com `10000: System Error`: descoberta automática ainda não validada. Reprodução sem credenciais em `docs/shopee-api-diagnostic.md`.
- Seis chamadas contabilizadas em 11/11; cinco hoje, incluindo falhas/introspecção. Cache remoto: 22 registros, um elegível aguardando revisão (teclado RGB ABNT2, nota 4,9, 25 vendas, pontuação 67). Mouse M808 excluído por zero vendas retornadas; produtos gerais excluídos pela curadoria. Limites preservados.
- Credenciais locais Supabase/Shopee/Telegram presentes. Segredos removidos de `.env.example`, mantidos no ambiente ignorado. Bot administrador confirmado por leitura; nenhuma mensagem enviada. Dispatcher e três operações pausados, flags de produção/teste false. Usuário informou `@dropoutech`; getChat confirmou que é o destino principal existente, não um canal separado. Depois esclareceu possuir somente esse canal. Envio nele exige autorização explícita de uma postagem concreta; não cadastrar esse destino como canal isolado ou afrouxar a proteção da rota de teste.
- Validação: suíte completa 192/192; após ajuste individual, 26/26 Shopee, tipos e novo build aprovados; diff sem erros, sem correspondências dos segredos nos arquivos versionáveis, ambiente ignorado. Sem navegador conectado para inspeção visual. Conferência remota final: produtos/ofertas/entregas/eventos 8/7/5/15 preservados, WhatsApp 0, jobs Shopee 0, aprovados 0; RLS das três tabelas ativo. Detalhes em `VALIDACAO.md`. Sem push/deploy ou configuração na Vercel.

## 2026-11-12 · Uma postagem de teste autorizada

- Usuário autorizou explicitamente a prévia do teclado com foto/legenda e marcador TESTE DROPOU no canal principal `@dropoutech`. Enviada uma única mensagem: https://t.me/dropoutech/18. Confirmação veio do Telegram (`sendPhoto`) e do recibo remoto, não de inspeção visual.
- `scripts/send-approved-shopee-test.ts`: execução específica para essa autorização/data, sem endpoint público ou cron. Padrão somente preflight; execução explícita reserva a autorização uma vez em `runs`, revalida o produto pela API sob o mesmo orçamento e exige legenda/foto iguais à prévia. Usa queue/claim manual e receipt existentes; persiste evidência oficial sem inventar estoque. Falha/entrega incerta não provoca retry.
- Preço revalidado: a partir de R$ 99,99, sem mudança da prévia. Requisições de hoje passaram de cinco para seis, sem alterar limites. Criados produto, oferta rascunho, job e entrega com evidência oficial para registrar este envio real. Não houve confirmação/publicação WhatsApp.
- Conferência remota: job/entrega `sent`, mensagem 18, `media_mode=photo`, `attempts=1`, um evento `sent`, uma reserva de autorização, estoque nulo. Dispatcher e três operações continuam false; nenhuma flag de ambiente foi alterada. Não houve liberação da descoberta/publicação automática.
- Validação desta postagem: teste transacional PGlite com 12/12 aprovados (novo caso manual com toda a automação pausada), typecheck e diff aprovados. O fixture recebeu somente os grants de `runs` que a consulta remota confirmou existentes. Sem nova migração, deploy ou push. A suíte completa de 192 e o build pertencem à etapa anterior, não foram repetidos nesta postagem.

## 2026-11-12 · Garimpo gamer e qualidade

- Escopo corrigido pelo usuário durante o trabalho: somente Dropou Gamer. Não habilitar Bruto/Moda ou criar grupos femininos nesta etapa. Painel e rotas continuam recusando os outros nichos; configurações/destinos preservados.
- `shopee-quality.ts` calcula score 40/25/20/15, cobertura dos dados, motivos/avisos, contexto gamer/tecnologia, variantes, tendência observada e variedade. Referências ajustáveis: 1.000 vendas, nota 4,6 e desconto 15% quando disponível. `shopee-automation.ts` mantém o contrato anterior e novos controles; `shopee-search.ts` planeja fontes com chaves comuns entre modos, sem duplicar a mesma consulta.
- Consultas reais de desempenho com `listType=2,sortType=2`, sem palavra e com `keyword=gamer`, retornaram 50 produtos cada. A combinação gamer resolve o caso observado de busca; isso não determina a causa interna das falhas anteriores nem valida toda palavra/categoria. Ordenação local usa vendas/avaliação/preço/comissão; não tratar ordem da API como tendência recente.
- `engine.ts` mantém orçamento, cache e worker; busca tentada uma vez por formato/dia, revalidação até duas vezes, avisos de rodada parcial, histórico de 30 dias e seleção por categoria/marca/faixa/loja. Variantes sem preço da foto comprovado são excluídas. Nomes equivalentes e histórico do canal reduzem duplicações; revisão e recibos incertos preservados. Endpoints/painel mostram critérios, confiança, componentes, crescimento e motivos.
- Migração local CLI `20261112112950_shopee_gamer_quality_history.sql`, aplicada ao projeto existente como `shopee_gamer_quality_history`, versão remota `20261112114322`. Acrescenta somente `assessment` e observações reais idempotentes, com RLS por proprietário/marca e índices. Não reaplicar schema/migrações anteriores. Não foram reconstruídas amostras perdidas.
- Cache remoto reavaliado: 114 registros, 114 amostras iniciais e sete candidatos, sem aprovações/envios. O falso positivo real de processador de alimentos foi corrigido e incluído em teste. Crescimento recente ainda insuficiente: exige amostras de dias diferentes. `scripts/reassess-shopee-cache.ts` revisa sem provedor/postagem, sob pausa obrigatória.
- Os diagnósticos elevaram o consumo diário a oito (limite do grupo), sem aumentar limites ou remover tentativas. Novas revisões usam só o cache. Advisors sem novos achados; recibos/eventos existentes 6/19 e mensagem 18 (uma tentativa) preservados; WhatsApp zero. Dispatcher/três operações false, `shopee_config={}` e flags de envio false mantidos.
- Validação: suíte completa 200/200, testes Shopee 34/34, tipos e build aprovados; detalhes/finalização em `VALIDACAO.md`. Sem navegador conectado para inspeção visual, sem push/deploy. Guia atual em `docs/shopee-gamer-quality.md`; histórico de falhas atualizado para distinguir formatos antigos e a consulta gamer bem-sucedida.
- Finalização: tipos/build final e 34/34 Shopee após ajustes finais, HTTP local 200/rotas operacionais 401 sem login, diff sem erros, segredos fora dos arquivos versionáveis. Consulta remota confirmou zero elegíveis violando mínimos/preço sem faixa. Sem aprovação/publicação nova; oito chamadas do grupo hoje e demais estados preservados.

## 2026-11-12 · Seleção Games & Tech e revisão do dashboard

- A listagem anterior abria em Todos e misturava descartados de outros nichos. `shopee-quality.ts` reforça exclusões por tipo de produto e contexto eletrônico; `shopee-dashboard.ts` aplica o escopo e exclui rejeitados/removidos das listas ativas. API e interface filtram o nicho, sem apagar o cache/auditoria.
- `offer-automation.tsx` abre em Elegíveis, esconde cards rejeitados/removidos após a confirmação e mantém filtros explícitos de histórico. Ações continuam funcionando para produtos distintos. `engine.ts` e a rota de automação usam a mesma avaliação com observações na exibição/aprovação; erros informam os motivos concretos. Não havia limite intencional de uma aprovação.
- Identidade azul em `workspace.css`: hero, indicadores, botões e cards; configuração recolhida em Filtros e rotina. Telegram e WhatsApp manual preservados, sem habilitar outros grupos.
- Reavaliação do cache existente: 114 registros, 50 relacionados ao nicho e sete elegíveis. Snapshot de revisão: três aprovados pelo usuário/quatro pendentes; o script não aprova nem modifica decisões. Zero chamadas Shopee/mensagens/configurações alteradas nesta reavaliação. Nenhuma nova migração ou liberação de envio.
- Validação nesta tarefa: 203/203 testes, typecheck e build aprovados; prévia SSR gerada. Regressões em `tests/shopee-dashboard.test.ts`, `shopee-quality.test.ts`, `shopee-engine.test.ts` e `shopee-ui.test.ts`, incluindo desaparecimento após atualização e múltiplas aprovações. Contraste calculado branco/azul 6,70:1. Sem navegador conectado para inspeção visual; sem push/deploy. Guia atualizado em `docs/shopee-gamer-quality.md`.

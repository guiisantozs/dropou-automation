# Expansão de canais e aprovação de agendamentos — 14/11/2026

Implementação local. A configuração remota e os destinos Telegram serão preenchidos depois, conforme solicitado. Nenhuma mensagem, ativação, migração remota ou consulta real à Shopee faz parte da validação desta entrega.

## Aprovar uma vez e publicar depois

Uma conferência salva não vence após 15 minutos. `checkedAt` conserva a data original da confirmação. A oferta pode ser agendada para amanhã ou para outra data dentro da janela de 30 dias já existente. O envio utiliza o snapshot, a foto e a legenda autorizados, com seus valores registrados. Não há consulta à loja nem alteração do preço na execução de um agendamento manual.

O banco e o dispatcher mantêm a conferência de correspondência entre produto, oferta, legenda e destino. Edição posterior, exclusão, rejeição, arquivamento, mudança do destino ou entrega incerta ainda impedem um envio indevido. Esses bloqueios não são vencimento por tempo. Jobs já retidos antes da implantação não são reativados silenciosamente; podem ser reagendados preservando a conferência anterior. Pausas do dispatcher e da marca continuam funcionando.

A validade curta do **cache da API Shopee** permanece distinta: observações recentes são reutilizadas por 15 minutos. Isso não revoga a aprovação humana de uma oferta salva.

## Canais compartilhando a estrutura

Novas operações: `celulares`, `tenis` e `automoto`. Todas reutilizam dashboard, curadoria, biblioteca de links, editor, ofertas, agenda, transporte Telegram, marcações manuais, histórico e catálogo existentes. Bruto & Barato e Moda Masculina conservam seus fluxos. Proprietário e marca continuam em chaves únicas, vínculos e políticas de acesso.

Cada canal possui palavras de busca e classificação por tipo real de produto. A pontuação mantém os critérios existentes de vendas, avaliação, pertinência, preço e histórico disponível; comissão não influencia o ranking. Anúncios suspeitos de falsificação e peças de compatibilidade incerta são excluídos das recomendações. O título de um anúncio não comprova autenticidade. Importações escolhidas pelo operador continuam sujeitas à revisão manual.

## Descoberta solicitada e importação prioritária

**Buscar produtos** é um POST explícito. Abrir páginas, atualizar, trocar de canal ou rodar o cron não inicia descoberta. Cada solicitação faz no máximo três consultas, tem lease por proprietário/canal e intervalo de um minuto para evitar cliques repetidos. Aprovar não publica. Os controles explícitos anteriores de preparar, planejar e liberar repetição continuam disponíveis na API.

A causa interna confirmada no código anterior era o uso compartilhado de `dropou_shopee_reserve`: importações tinham `kind=search`, consumiam o teto global padrão de dez chamadas/dia e o teto da operação, normalmente oito. A importação agora usa `kind=manual` e uma reserva transacional independente. Limites iniciais:

| Finalidade | Por canal/dia | Global/dia | Ajuste |
| --- | ---: | ---: | --- |
| Importação manual | 200 | 200 | Configurações do canal e `SHOPEE_MANUAL_DAILY_REQUEST_LIMIT` |
| Descoberta | 8 | 40 | Configurações do canal e `SHOPEE_DISCOVERY_DAILY_REQUEST_LIMIT` |

Esses são controles **internos do Dropou**, não uma afirmação da cota contratada na Shopee. A disponibilidade e os limites reais da conta só podem ser confirmados depois da configuração. HTTP 429, `Retry-After` e erros GraphQL continuam classificados pelo cliente existente; cooldowns reais valem para ambos os fluxos. Falhas de autenticação/contrato têm suspensão própria. Não há rotação de credenciais ou tentativa de contornar o provedor.

Links ficam persistidos antes da consulta e são processados em lotes de até cinco IDs exatos por chamada. Leases, reserva global de chamada em andamento, cache por produto/proprietário compartilhado entre canais e backoff evitam duplicação. O cache compartilha fatos, não decisões nem estados de publicação. Uma resposta antiga não sobrescreve cache mais novo. Pendências preservam o link, mostram o motivo e permitem retomar após o cooldown ou preencher manualmente; não se preenche preço/foto/link afiliado por suposição. Não há retries ocultos ou fila de publicação criada por importação.

O formulário **Tentar dados oficiais** também usa o mesmo fluxo de importação Shopee, sem busca geral. Um link comum não é considerado afiliado: é usado o `offerLink` oficial retornado pela API. Sem retorno, o cadastro manual pede o link afiliado confirmado.

**Busca e consumo** mostra consultas, importações, hits de cache, respostas de limite e os estados das chamadas. A IA mantém o orçamento, cache e relatório existentes; as chamadas locais por marca não geram cobrança. Nenhum orçamento pago é ampliado automaticamente.

## Telegram e WhatsApp

Em Configurações, associe o Chat ID numérico a cada marca e escolha o bot principal ou o bot específico. Os tokens ficam apenas no servidor:

- `TELEGRAM_BOT_TOKEN`: bot principal que pode atender vários canais.
- `TELEGRAM_CELULARES_BOT_TOKEN`, `TELEGRAM_TENIS_BOT_TOKEN`, `TELEGRAM_AUTOMOTO_BOT_TOKEN`: opcionais, quando forem usados bots diferentes.

O bot precisa ser administrador do canal com permissão de postar. **Verificar canal** consulta identidade e permissões, sem enviar. O teste de publicação tem confirmação própria e reserva idempotente antes do envio. Trocar bot ou Chat ID limpa a verificação anterior. Não há destinos preenchidos ou conexão simulada.

Publicação de produto reutiliza `sendPhoto`, com foto acima e legenda abaixo. Legendas longas usam as mensagens vinculadas já existentes. Falhas/incertezas não são marcadas como publicadas nem repetidas automaticamente. O ID, destino e data do Telegram vêm do recibo real. WhatsApp permanece manual, com cópia de legenda/link e marcação independente.

## Equipe

O proprietário existente mantém o acesso. Crie as contas adicionais no Supabase Auth; em Configurações → Equipe, informe o email e libere os canais. Não são criados, apagados ou alterados usuários Auth por esse formulário. Administradores gerenciam configurações e acessos; operadores trabalham nos canais liberados. Suspender acesso tem efeito na próxima requisição e nas políticas do banco.

`operation_members` associa cada membro a um workspace e canais. As funções privadas resolvem o proprietário pela sessão autenticada, sem confiar em metadata editável ou UUID enviado pelo navegador. APIs validam o acesso antes de usar funções privilegiadas; RLS também restringe leituras e escritas diretas, inclusive quando alguém forja `brand=all`. Uploads de imagens conservam marca e ator, e URLs assinadas também verificam acesso. O registro `operation_audit` identifica quem aprovou, validou, agendou e publicou; operadores veem suas próprias ações, e administradores podem consultar a equipe.

## Configurar depois

1. Conectar o projeto **Dropou**, referência `wqpdyfipjsnyzxktacqh`. A conexão Supabase disponível nesta sessão pertence a outro projeto, que não foi alterado.
2. Conferir o histórico remoto e aplicar **somente** as novas migrações `20261114155746_persistent_publication_approval.sql` e `20261114155749_channel_expansion_team_and_imports.sql`. Não reaplicar schema, seeds ou migrações históricas. Há versões remotas antigas com timestamps diferentes dos arquivos locais, documentadas no AGENTS; não executar um `db push` indiscriminado.
3. Preencher `.env.local` e o ambiente de hospedagem com a configuração Supabase, a chave privilegiada já utilizada pelo backend, credenciais Shopee autorizadas e tokens dos bots. Esta cópia não contém `.env.local` preenchido. Usar `.env.example` como referência de nomes, mantendo chaves privadas exclusivamente no servidor.
4. Cadastrar os três Chat IDs, escolher/verificar cada bot e cadastrar os acessos dos operadores. Conferir a lista de proprietários autorizados em `telegram_dispatch_config`; operadores usam o workspace desse proprietário, sem incluir seus IDs na lista de publicação privilegiada.
5. Publicar o código atualizado na hospedagem existente e conferir por leitura as APIs, o cron existente e os advisors. Fazer testes reais de envio somente pelas confirmações explícitas da interface. Nenhum segundo cron deve ser criado.

As migrações não ativam rotinas nem reabrem entregas. O scheduler existente continua responsável apenas pelas publicações que já foram explicitamente agendadas.

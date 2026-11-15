# Celulares & Gadgets e publicação em canais

## Configuração autorizada

O usuário informou o canal público `@dropoucelulares` e o bot `@celularegadgetbot`, e cadastrou `TELEGRAM_CELULARES_BOT_TOKEN` como Secret em Production na Vercel. Apenas a existência da variável foi consultada; o token não foi baixado, versionado ou registrado em logs.

No Supabase do Dropou, Celulares usa essa variável exclusiva e guarda o nome esperado do bot. O primeiro diagnóstico autenticado resolve o @nome para o Chat ID numérico, verifica `getMe`, `getChat` e `getChatMember` e só então registra a verificação. Token de outro bot, ausência de administração/permissão de postagem ou destino inválido bloqueiam a publicação. O destino Tech & Games não é usado como alternativa para Celulares.

Configurar/verificar não ativa a rotina nem envia mensagem. A automação de Celulares permanece pausada; publicação imediata continua exigindo confirmação do usuário. O administrador pode liberar os agendamentos futuros pelo controle existente. A conta/API Shopee já configurada é reutilizada; não há nova conta de afiliado ou cota externa presumida.

O diagnóstico privado existente `/api/telegram/dispatch` aceita GET com `brand=celulares`, protegido pelo mesmo segredo interno do dispatcher. Isso permite verificar o bot dentro da Vercel, sem ler seu token fora do servidor e sem executar o POST de envio. Nenhum endpoint público de configuração ou cron adicional foi criado.

## Publicar em canais

Na oferta salva, o botão **Publicar em canais** abre os destinos Telegram autorizados. O canal da oferta vem selecionado quando disponível; os demais exigem escolha explícita. Canais sem configuração ou com envio já registrado/agendado/incerto ficam indisponíveis. A confirmação mostra quantos destinos foram escolhidos, a mesma legenda/foto aprovadas e a alternativa de agendar em America/Bahia.

O produto permanece no canal de origem. Uma seleção de outro canal cria um cadastro/rascunho isolado nesse destino, conservando preço aprovado, link afiliado, foto e legenda. Se já existir um cadastro, as informações e a legenda devem coincidir; edições, rejeições e arquivamentos não são sobrescritos. A mesma legenda aprovada é compartilhada, sem trocar seu rodapé silenciosamente. Um produto já publicado em Tech & Games pode ser enviado apenas a Celulares, sem nova postagem em Tech & Games.

A autorização gera filas em uma transação, com verificação do ator, bloqueios e auditoria. Destinos repetidos, marcas sem permissão e o mesmo Chat ID em duas marcas são recusados. Um destino inválido desfaz toda a preparação; nenhum envio ocorre antes dessa transação terminar.

Depois, cada envio passa pelo dispatcher e pelos recibos existentes. Os resultados são individuais: publicado, pendente, falha, parcial ou incerto. Uma resposta perdida pode ser consultada usando a mesma autorização, sem executar os envios novamente. Fechar/reabrir também não ignora os bloqueios de duplicidade. Telegram e WhatsApp permanecem independentes; esta seleção não automatiza o WhatsApp.

## Validação

- Migração CLI `20261115004206_multichannel_publication_batches.sql`, incremental, sem alterar arquivos já aplicados. Tabela de autorizações com RLS e acesso só service_role; RPC com `security invoker`, `search_path` vazio e acesso privilegiado restrito.
- 276 testes completos passaram. PGlite com SQL real cobre dois destinos, dados/legenda preservados, rollback, operação não autorizada, solicitação repetida e sucesso/incerteza independentes. Também confirma encaminhar só para Celulares após publicação em Tech & Games.
- Interface JSDOM cobre seleção, confirmação explícita, resultados parciais e mesma autorização após resposta perdida. Chamadas Telegram simuladas verificam identidade e permissão sem métodos de envio.
- Typecheck e build aprovados. Chrome: seleção e agendamento em 320/375/768/1440 px, oito combinações sem overflow/imagens quebradas/erros; capturas mobile/desktop inspecionadas. São fixtures, não uma sessão autenticada de produção.
- Migração aplicada somente no Dropou. Destino/bot de Celulares registrados sem ativação. Advisors sem novos achados; permanece o aviso preexistente de proteção contra senhas vazadas desativada. A conferência efetiva do bot após deploy deve ser registrada na entrega.

Nenhuma mensagem real, chamada Shopee ou geração paga como teste. Comprovantes antigos, filas e configurações das demais marcas são preservados.

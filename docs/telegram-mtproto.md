# Conexões Telegram — etapa 1

Atualização local: [fila persistente da etapa 4](telegram-mirror-queue.md), com migração ainda pendente de autorização. O novo worker exige essa migração antes de iniciar; os relatos abaixo registram a versão anterior já validada.

Identificação de links em texto/legenda: [registro da etapa 2](telegram-mtproto-shopee.md). Conversão controlada com a integração oficial da nossa conta: [guia da etapa 3](telegram-mtproto-affiliate.md). Sem publicação automática.

A migração corrigida `20261115234052_telegram_mtproto_connections` foi aplicada com autorização ao projeto Dropou `wqpdyfipjsnyzxktacqh`. Postcheck, permissões, histórico, Data API e lease com rollback aprovados; dados anteriores preservados. **Não reaplicar a migração nem os roteiros de aplicação abaixo.** Detalhes no [registro da migração](telegram-mtproto-migration-review.md). O worker normal local foi iniciado posteriormente com autorização e validado com `ready=true` e renovação de lease. O usuário realizou o primeiro login real pela interface. O teste real posterior comprovou recebimento de texto e foto, enviados manualmente pelo usuário; o diagnóstico foi encerrado e limpo após a conferência, mantendo a conta conectada e o worker saudável.

O painel usa a API de contas MTProto por meio de GramJS (`telegram`, versão fixada em `package.json`). O bot publicador continua em `src/server/telegram*.ts`, sem alterações de transporte, destinos ou cron. As cores dos canais são preservadas; a nova tela reutiliza os componentes e o tema da operação.

## Arquitetura

```text
Administrador → dashboard Next.js → sessionDb + admin + publicationAdmin
             → /api/telegram/connections → HTTPS + segredo interno → worker Node
                                                               → GramJS → MTProto
                                                               → Supabase (sessão cifrada)
```

O navegador recebe somente estados, títulos/IDs de canais selecionados e metadados de diagnóstico. A sessão StringSession, o telefone pendente e o hash do desafio ficam cifrados com AES-256-GCM, IV aleatório e AAD vinculado a proprietário/marca. São usados os mesmos primitivos criptográficos do cofre OAuth existente, com chave e domínio de AAD próprios. O telefone/hash são apagados ao concluir o login ou após a expiração. Código e senha 2FA não são persistidos e os campos são limpos após cada envio. Não colocar essas credenciais em tickets, logs ou ferramentas de análise de corpo de requisições.

Todas as ações e leituras da nova API exigem administrador autenticado e proprietário autorizado pela configuração de publicação. O desligamento da publicação automática não bloqueia o teste de recebimento. A marca `all` não cria conexões; cada marca tem sua seleção e sessão separadas. As três tabelas novas têm RLS ativo e nenhum grant para anon/authenticated; somente o backend privilegiado acessa as sessões. Não há endpoint público para iniciar login no worker.

O worker adquire uma lease singleton no banco por 30 segundos, renova a cada cinco e fecha conexões antes da lease vencer se perder acesso ao banco. Mutação e diagnóstico verificam o holder no banco. Mantenha **uma única réplica**; uma segunda é recusada. O supervisor deve reiniciar o processo em falhas. O worker restaura sessões criptografadas após reiniciar, sem recuperar mensagens do período offline. A API HTTP do worker é privada, autenticada por segredo de pelo menos 32 caracteres e não habilita CORS.

GramJS foi instalado com aviso de pacote arquivado pelo npm. Seu uso permanece isolado em `src/server/mtproto/adapter.ts`; uma migração futura para biblioteca mantida pode substituir esse adaptador. Compatibilidade compilada e fixtures não comprovam compatibilidade de uma conta real com a versão atual do Telegram.

## Credenciais e configuração

Obtenha seu próprio `api_id` e `api_hash` em [my.telegram.org → API development tools](https://core.telegram.org/api/obtaining_api_id). Eles são diferentes do token do BotFather. Telefone, código e senha 2FA são informados exclusivamente na tela privada de conexão; não são variáveis de ambiente.

| Variável | Onde configurar | Uso |
| --- | --- | --- |
| `TELEGRAM_MTPROTO_API_ID` | Worker | ID numérico da aplicação Telegram |
| `TELEGRAM_MTPROTO_API_HASH` | Worker | Hash privado da aplicação Telegram |
| `TELEGRAM_MTPROTO_SESSION_KEY` | Worker | 32 bytes aleatórios em base64 para AES-256-GCM |
| `TELEGRAM_MTPROTO_WORKER_SECRET` | Next.js e worker | Mesmo segredo aleatório de pelo menos 32 caracteres |
| `TELEGRAM_MTPROTO_WORKER_URL` | Next.js | Origem HTTPS do worker; HTTP apenas em localhost no desenvolvimento |
| `SUPABASE_URL` ou `NEXT_PUBLIC_SUPABASE_URL` | Worker | URL do projeto Dropou existente |
| `SUPABASE_SECRET_KEY` ou `SUPABASE_SERVICE_ROLE_KEY` | Worker | Chave privilegiada existente, nunca publicável |
| `TELEGRAM_MTPROTO_WORKER_HOST` | Worker | Padrão local `127.0.0.1`; `0.0.0.0` em container |
| `PORT` ou `TELEGRAM_MTPROTO_WORKER_PORT` | Worker | Porta HTTP; padrão 8081 |

Nenhuma variável MTProto recebe prefixo `NEXT_PUBLIC_`. Gere a chave de sessão e o segredo interno separadamente com um gerenciador de segredos. Para desenvolvimento, pode usar `node -e "process.stdout.write(require('node:crypto').randomBytes(32).toString('base64'))"` em terminal privado e salvar diretamente no `.env.local` ignorado. Não copiar os valores para a documentação ou chat. Guarde a chave de sessão em backup seguro: perdê-la exige desconectar e autorizar novamente todas as sessões. Rotação exige descriptografar/recriptografar no servidor com ambas as chaves, ou desconectar antes da troca.

1. Migração `20261115234052_telegram_mtproto_connections.sql` já aplicada e conferida no projeto Dropou. Não reaplicar, executar reset, schema inicial, seeds ou `db push` indiscriminado: há outras alterações locais neste checkout.
2. Configurar as variáveis acima no ambiente privado. Localmente, `npm.cmd run worker:telegram` carrega `.env.local` pelo Node; em hospedagem, o gerenciador injeta os segredos.
3. Executar `npm.cmd run worker:telegram` com Node 24 e as dependências do lockfile. `/health` só responde a requisições com `Authorization: Bearer <segredo interno>`; não passar esse segredo em URLs ou logs.
4. Iniciar o Next (`npm.cmd run dev`) ou publicar o dashboard pelo fluxo habitual, com URL/segredo do worker configurados no servidor.

Se uma tentativa retornar timeout, atualize o estado antes de repetir. Não há reenvio HTTP automático de comandos de autenticação. Pedidos de código têm intervalo de um minuto; código e 2FA têm até oito tentativas por desafio, intervalo entre verificações e expiração de cinco minutos. Flood waits do Telegram são respeitados. O fluxo não cria contas novas, não recupera senhas e não tenta contornar restrições de login do provedor.

## Como comprovar o recebimento

### Ambiente local pronto para o primeiro login

O worker normal atende em `http://127.0.0.1:8081` e o Dropou local em `http://127.0.0.1:3000`. Abrir [Conexões Telegram local](http://127.0.0.1:3000/?brand=dropou&view=telegram-connections) e entrar no Dropou como administrador. Antes de autenticar a conta Telegram, a tela deve mostrar **Worker: online** e conta **Desconectada**. Não solicitar código enquanto estiver apenas verificando a preparação.

Nesta preparação, as quatro credenciais foram validadas pela implementação, o arquivo `.env.local` permaneceu idêntico e as três tabelas foram consultadas sem retornar conteúdo de registros. Healthcheck autenticado HTTP 200/`ready=true`, recusa 401 sem segredo/com segredo errado e renovação da lease passaram. O helper real `mtprotoWorker` alcançou a origem privada com o segredo correto; um comando vazio recebeu 400 antes do handler de conta, sem criar conexão ou chamar Telegram. O endpoint do Dropou recusou GET/POST sem sessão com 401, e a página respondeu 200 sem credenciais privadas no HTML. O fluxo da página com sessão real depende da entrada do administrador; esses testes não substituem essa conferência nem um login Telegram real.

Manter o computador acordado e os dois processos ativos durante o login. Comandos em dois terminais separados na raiz do projeto, para reiniciar **somente depois de encerrar os processos já ativos**:

```powershell
npm.cmd run worker:telegram
```

```powershell
npm.cmd run dev -- --port 3000
```

Não usar `--diagnostic` para o login e não executar uma segunda réplica do worker. Para encerrar, usar **Ctrl+C** no terminal de cada processo. Se foram iniciados pela sessão do agente e os terminais não estiverem acessíveis, usar os PIDs informados no relatório desta sessão com `Stop-Process -Id <PID>` no PowerShell. Esse encerramento forçado deixa a lease expirar em até 30 segundos; aguardar a expiração antes de reiniciar. Encerrar o worker interrompe prontidão/recebimento, mas preserva a sessão cifrada que venha a ser criada em uma etapa futura.

O único registro operacional persistido pela inicialização é a lease singleton renovada pelo worker. Não há alteração de schema ou dados de negócio. As tabelas de conexões e diagnósticos estavam vazias antes de iniciar e permaneceram vazias na validação; nenhum cliente de conta Telegram foi criado, código solicitado, canal selecionado ou teste iniciado.

### Roteiro após autorização do login real

1. Entrar no Dropou como administrador, escolher a marca e abrir **Conexões Telegram** (`/?brand=dropou&view=telegram-connections`).
2. Conferir worker online, informar telefone internacional, autorizar a conexão e solicitar o código. Informar o código recebido pelo Telegram e a senha de duas etapas se solicitada.
3. Conferir **Conectado**. Clicar **Listar canais**, selecionar uma fonte controlada e salvar a seleção. A consulta pagina 100 diálogos por ação; canais e supergrupos são exibidos, conversas privadas são descartadas. **Carregar mais canais** também aparece quando uma página contém apenas conversas privadas. Canais arquivados podem aparecer. A resposta de diálogos do Telegram inclui o último item necessário à paginação, processado apenas em memória: o app não importa nem persiste históricos, corpos, participantes ou mídias. Nenhum canal é ingressado automaticamente.
4. Selecionar um canal em que essa conta seja criadora/administradora, confirmar que ele é uma fonte controlada e clicar **Iniciar teste**. A permissão é revalidada diretamente pela API; o checkbox não substitui essa verificação. O recebimento de outros canais, chats privados e itens protegidos/temporários é descartado.
5. Publicar manualmente **uma nova mensagem de teste** no canal escolhido, depois do início mostrado. O Dropou não envia a mensagem de teste.
6. Aguardar a atualização da tela (cinco segundos), conferir ID/tipo e horários de publicação/recebimento. Os metadados são gravados pelo callback MTProto real somente dentro da janela de dez minutos. Não são amostras inventadas.
7. Usar **Encerrar e limpar diagnóstico**. A sessão continua conectada; o teste para. **Desconectar conta** encerra a sessão Telegram, apaga o material criptografado e a seleção desta marca. Se a revogação remota não for confirmada, a tela orienta encerrar a sessão Dropou em **Configurações → Dispositivos** no aplicativo oficial.

Somente os últimos 50 eventos são mantidos, por até uma hora. Uma limpeza do worker remove os vencidos a cada ciclo (15 segundos, mais o tempo de processar conexões); leituras já os excluem pelo relógio do servidor. Com o worker desligado, a remoção física aguarda seu retorno, mas eventos vencidos não aparecem no dashboard. A expiração do login também é limpa pelo worker; se ele estiver parado, o desafio é recusado ao retornar. Um reinício dentro de um teste estabelece um novo limite de tempo ao vivo e ignora mensagens do intervalo offline. Não há garantia de captura sem perdas: esta etapa mede recebimento ativo, sem backfill. Para um diagnóstico de erro de conexão, a tela exibe uma categoria segura, nunca o payload bruto do provedor.

### Resultado do teste real local

Em 15/11/2026 à noite (Bahia), o usuário iniciou o teste pelo painel e publicou manualmente texto e foto em fonte administrada. Foram conferidos somente IDs, tipos e horários dos metadados: um evento `text` com atraso medido de aproximadamente 0,62 s e um `photo` com aproximadamente 0,69 s, ambos na fonte esperada e dentro de suas respectivas janelas. Esses atrasos usam a diferença entre `received_at` e o horário Telegram, que tem resolução de segundos; não constituem medição precisa de latência da rede.

Os dois eventos foram comprovados em janelas distintas: reinícios manuais encerraram/limparam a primeira janela, por isso seu texto não aparecia na lista da janela seguinte. Mensagens anteriores ao início atual são descartadas por projeto. A foto nova apareceu no painel, confirmada pelo usuário e pela consulta de metadados. Nenhuma duplicação foi observada nos registros conferidos.

Healthcheck, lease e heartbeats permaneceram saudáveis nas amostras durante o teste. Após a validação, a ação existente **Encerrar e limpar diagnóstico** foi executada via helper do backend, sem logout: campos da janela nulos, zero diagnósticos restantes, conta `connected`, healthcheck 200 e lease ativa. O worker local permanece ligado, com o teste de recebimento encerrado. Nenhum conteúdo, mídia, remetente, credencial ou sessão foi coletado para o relatório, e o agente não publicou mensagens nem implementou novas funcionalidades.

## Operação contínua

Use um serviço persistente Node 24 ou container/VPS com reinício automático, saída TCP para os data centers Telegram e HTTPS para o Supabase. O worker precisa permanecer executando; não é tarefa do cron publicador nem uma chamada longa do dashboard. O Next pode continuar hospedado separadamente. As [funções Vercel têm duração limitada](https://vercel.com/docs/functions/limitations), portanto não são o processo de longa duração usado aqui.

Foi incluído `deploy/telegram-mtproto.Dockerfile`, com cópia seletiva dos arquivos e `.dockerignore` para excluir segredos. Exemplo de construção: `docker build -f deploy/telegram-mtproto.Dockerfile -t dropou-mtproto .`. Injete os segredos pelo mecanismo privado do host e execute com política de reinício (`unless-stopped` ou equivalente), uma réplica, TLS no proxy de entrada, timeouts de pelo menos 30 segundos e sem registrar corpos de login. Não incluir `.env.local` na imagem. O processo usa memória para o cliente; a sessão durável fica no Supabase, sem volume local necessário. O Dockerfile é preparado para implantação; executar os testes no Windows não comprova a construção do container.

O teste de dez minutos continua mesmo se fechar o navegador ou desligar o computador, desde que o worker esteja hospedado e online. Ao vencer, a sessão pode permanecer conectada, mas nenhum novo diagnóstico é armazenado. Monitoramento permanente de ofertas e republicação automática ficam fora desta etapa. O cron `dropou-telegram-dispatch`, o Bot API e os fluxos WhatsApp não são alterados.

Fontes: [GramJS: autorização](https://gram.js.org/getting-started/authorization), [Telegram: atualizações](https://core.telegram.org/api/updates), [termos da API](https://core.telegram.org/api/terms), [Supabase: RLS](https://supabase.com/docs/guides/database/postgres/row-level-security), [Docker: reinício automático](https://docs.docker.com/engine/containers/start-containers-automatically/).

## Etapa 2 — preparação e diagnóstico locais, sem login

É possível testar a comunicação privada antes de configurar o banco completo:

```text
npm.cmd run worker:telegram -- --diagnostic
npm.cmd run worker:telegram:check
```

O primeiro comando inicia **explicitamente um modo de diagnóstico**, aceito somente em loopback (`127.0.0.1`, `::1` ou `localhost`). As quatro credenciais MTProto continuam sendo validadas, mas nenhum cliente Telegram, cliente Supabase, lease, restauração de sessão ou consulta ao banco é iniciado. Não existe fallback automático do modo normal para diagnóstico.

No `.env.local`, a preparação local usa `TELEGRAM_MTPROTO_WORKER_URL=http://127.0.0.1:8081`, `TELEGRAM_MTPROTO_WORKER_HOST=127.0.0.1` e `TELEGRAM_MTPROTO_WORKER_PORT=8081`. As demais variáveis e os quatro segredos existentes são preservados. O arquivo deve permanecer ignorado pelo Git. Se houver `PORT` no ambiente, ele tem prioridade sobre a porta específica do worker.

O segundo comando faz requisições reais ao HTTP local. O segredo é lido do ambiente e usado somente no header, sem aparecer em argumentos, URLs ou logs. O teste não envia telefone, código, senha ou comando válido de conta. Resultados esperados:

| Verificação | Resultado |
| --- | --- |
| `GET /health` com segredo correto | HTTP 200, `mode=diagnostic`, `transportReady=true` |
| `GET /health` sem segredo ou com segredo errado | HTTP 401 |
| `POST /command` com segredo correto | HTTP 503, `diagnostic_only`, antes de interpretar o corpo |
| Prontidão para login e banco | `ready=false`, `accountLoginEnabled=false`, `databaseReady=false` |

Esse resultado comprova URL/porta, servidor HTTP e autenticação interna compartilhada. Não comprova a integração autenticada completa do dashboard com o banco, nem login ou recebimento MTProto. O diagnóstico não registra lease e não marca o worker como operacional no banco do dashboard. As rotas do dashboard continuam exigindo sessão e autorização administrativa normais.

Para sair do diagnóstico, encerrar o processo no terminal em que foi iniciado (Ctrl+C) e só depois iniciar o modo normal na mesma porta. Para o modo normal, são necessários a URL Supabase existente, `SUPABASE_SECRET_KEY` ou `SUPABASE_SERVICE_ROLE_KEY` no servidor e a estrutura de `20261115234052_telegram_mtproto_connections.sql` no banco escolhido. O comando `npm.cmd run worker:telegram` informa somente os nomes das configurações ausentes/inválidas, sem seus valores. Não preencher a chave privilegiada com a chave publicável.

Reiniciar também o servidor Next após configurar URL/segredo para que o dashboard carregue o ambiente atualizado. Configurar a chave privilegiada e instalar a estrutura do banco são etapas separadas; este diagnóstico não executa nenhuma delas automaticamente.

### Histórico da preparação local, anterior à aplicação autorizada

Na preparação inicial desta etapa, a chave privilegiada não estava presente no `.env.local`; a inicialização normal foi recusada antes de criar qualquer cliente de banco. A migração existente foi novamente executada **apenas em PGlite em memória**, para validar SQL, permissões e lease. Nenhuma nova migração era necessária para o diagnóstico HTTP. A tentativa de consultar o histórico remoto foi recusada por permissão do conector; por isso, naquela conferência a presença da migração em produção não foi confirmada. Não foi feita aplicação remota, reset, seed, deploy, alteração de outras funcionalidades ou autenticação de conta Telegram nessa preparação.

Conferência posterior, ainda antes da aplicação e após o usuário configurar a chave secreta local: acesso somente de leitura à tabela administrativa existente respondeu HTTP 200, sem retornar registros. As três tabelas MTProto responderam HTTP 404/PGRST205 (indisponíveis no schema cache da API). A chave foi aceita, mas a estrutura MTProto ainda não estava disponível nesse ambiente. Nenhuma RPC de lease, inicialização normal, migração remota ou autenticação Telegram foi executada nessa conferência. Essa pendência foi resolvida na aplicação autorizada registrada no início deste documento; o diagnóstico local foi encerrado e o worker normal permanece parado.

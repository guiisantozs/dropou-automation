# Dropou Automação

Aplicação Next.js, TypeScript, Tailwind e Supabase para curadoria de ofertas de tecnologia e games. O MVP funciona sem conta externa, com dados explicitamente demonstrativos salvos no navegador. Não publique os valores de exemplo como ofertas reais.

## Executar

Requer Node.js 20.9+ e npm. No PowerShell use `npm.cmd` se a política local bloquear `npm.ps1`.

```powershell
npm.cmd ci
Copy-Item .env.example .env.local
npm.cmd run dev
```

Abra http://127.0.0.1:3000. Para validar: `npm.cmd test`, `npm.cmd run typecheck` e `npm.cmd run build`. Produção: `npm.cmd run build` seguido de `npm.cmd start`.

## MVP e fluxo

- Cadastro e edição de produto, nicho, preços, estoque, imagem, URLs e parcelamento. Filtros por texto, loja, nicho e status.
- Fila: encontrado → aguardando link → pronto → agendado → publicado. A prévia permite mover estados. Para pronto/agendado/publicado, confira preço e estoque e adicione link oficial. Alterar preço ou URL original invalida a conferência anterior.
- Legenda inclui #publi e assinatura; só mostra preço anterior e economia quando a referência foi verificada e supera o preço atual. Parcelamento só aparece quando verificado. O link é omitido enquanto não for fornecido.
- CSV: até 1.000 linhas/2 MB, UTF-8, cabeçalho conforme [exemplo](public/exemplo-produtos.csv), separador vírgula ou ponto e vírgula detectado pelo parser, decimais com ponto. Campos contendo vírgula devem estar entre aspas. `true/false`, `sim/nao` ou `1/0` nos booleanos. Falhas por linha são informadas; linhas válidas são importadas. CSV nunca registra preço como recém-verificado. Duplicação considera domínio e caminho, ignorando parâmetros. Revise variantes cujo identificador esteja apenas na query.
- URLs originais precisam pertencer à loja. Links de afiliado são colados pelo usuário, com validação de domínio (não comprova afiliação ou titularidade). Mercado Livre: copie do Portal de Afiliados. Não há geração de links.
- WhatsApp Channels: copiar legenda, copiar link e registrar manualmente depois da postagem. Sem automação não oficial.
- A demonstração mantém dados e logs locais, sem executar cron ou enviar Telegram. A fila permite simular os estados sem criar links fictícios. Produtos demo não são enviados pelo servidor. `localStorage.removeItem('dropou-v1')` e recarregar restaura exemplos.

## Supabase em produção

1. Crie ou selecione seu projeto Supabase. Execute `supabase/schema.sql` no SQL Editor de um projeto novo. O arquivo não foi aplicado automaticamente a nenhuma conta.
2. Crie seu usuário no Supabase Auth (email e senha). A aplicação tem login; cadastro público não é necessário.
3. Configure `NEXT_PUBLIC_DATA_MODE=supabase`, `NEXT_PUBLIC_SUPABASE_URL` e `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`. Recompile: variáveis NEXT_PUBLIC são definidas durante o build.
4. Configure `SUPABASE_SERVICE_ROLE_KEY` e um `CRON_SECRET` aleatório forte apenas no ambiente do servidor. Nunca use prefixo NEXT_PUBLIC para segredos. Configure também os segredos do Telegram quando for ativá-lo.
5. Entre no painel. O catálogo começa vazio no modo real. O Supabase guarda produtos e configurações por usuário; RLS restringe leitura e escrita por `auth.uid()`. Logs são inseridos e lidos pelo proprietário. Runs e deliveries têm leitura do proprietário e escrita exclusiva do servidor. A service role só é importada por módulos `server-only`.
6. Confirme RLS com dois usuários: A insere um produto; B não pode ler, atualizar ou excluir esse produto nem inserir em nome de A. Sem autenticação, nenhuma tabela deve ser acessível. Esse teste requer seu projeto e não foi executado sem credenciais.

As tabelas de auditoria não são um registro forense imutável: o usuário pode inserir seus próprios logs. A aplicação não guarda tokens de lojas no navegador. A sessão Supabase usa o cliente oficial com chave publicável e RLS; em máquinas compartilhadas, saia ao terminar.

## Agendamento sem computador ligado

O endpoint Node `/api/cron` exige `Authorization: Bearer <CRON_SECRET>`. Hospede a aplicação em Vercel ou em um servidor/container sempre ligado e use um agendador externo. O arquivo `vercel.json` solicita execução a cada minuto; verifique se seu plano oferece essa frequência. Em outros provedores, configure cron gerenciado para chamar o endpoint a cada minuto, com o cabeçalho secreto armazenado no cofre do provedor. Não use tarefa local do Windows como solução de produção.

Os horários padrão são **09h, 12h, 16h e 20h em America/Bahia**, alteráveis no painel. O handler converte o instante recebido para o fuso e só executa em um minuto configurado. Ele não recupera automaticamente janelas perdidas em indisponibilidades. A restrição única `(owner_id, slot)` impede execução concorrente/repetida da janela; runs falhos exigem análise antes de liberar nova execução. Salve a configuração uma vez por usuário para criar `settings`.

O fluxo tenta buscar candidatos, descarta duplicados/esgotados/preços com mais de 15 minutos, mantém o histórico e revalida cada oferta agendada antes de enviá-la. Se o preço mudar ou o estoque acabar, retira a oferta da fila de publicação para revisão. Integração indisponível bloqueia o envio e gera log. Não exclui produtos históricos do catálogo.

## Integrações: preparação entregue, ativação pendente

`src/server/adapters.ts` define `search` e `revalidate` para cada loja. Os adaptadores **lançam erro de configuração** de propósito: não há endpoint suposto, scraping ou busca real. Para ativar, obtenha autorização, consulte a documentação oficial liberada à sua conta e implemente/teste o contrato com respostas reais, ID estável, preço, estoque, referência histórica e data de conferência. A Open API da Shopee depende de aprovação e credenciais. Não confunda API de vendedor com acesso de afiliado. Só considere um preço anterior verificado quando houver evidência autorizada.

Telegram usa exclusivamente `https://api.telegram.org/bot<TOKEN>/sendMessage`. Configure `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`, dê permissão ao bot no canal e habilite o envio em Agendamento. A oferta deve ter link oficial, status agendado, horário devido e revalidação oficial concluída. Enquanto os adaptadores estiverem bloqueados, nenhuma publicação automática ocorrerá.

Uma chave única por produto/canal em `deliveries` impede reenvio automático. Em timeout, o registro permanece `sending`: o Telegram pode ter aceitado a mensagem. Confira o canal antes de intervir. Não é possível prometer entrega exatamente uma vez em uma API externa sem idempotência. Não há retry cego. Para republicar o mesmo item futuramente, desenhe primeiro uma política de campanha/cooldown; o MVP bloqueia repetição permanente por produto/canal.

## Implantação e verificações

Suba este repositório em seu provedor Next.js, configure variáveis e segredos e aplique o schema no Supabase. Não envie `.env.local`. Ative cron na nuvem e teste primeiro com canal Telegram privado após concluir os adaptadores. Veja os logs de execução do provedor e a tela de logs do aplicativo. As chamadas não registram URLs que contenham o token do bot.

Não há projeto Supabase criado, credenciais configuradas ou publicação real ativada por este código. A demonstração é independente do banco. Testes automatizados cobrem legendas, verificações de preço, links, CSV, deduplicação e fuso do agendador; banco real e integrações exigem validação no ambiente autorizado.

Referências oficiais consultadas: [Next.js](https://nextjs.org/docs/app/getting-started/installation), [Supabase](https://supabase.com/docs/guides/auth/server-side/creating-a-client), [Telegram Bot API](https://core.telegram.org/bots/api#sendmessage).

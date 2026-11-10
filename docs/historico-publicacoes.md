# Destino, datas e histórico de publicações

Implementação de 10 de novembro de 2026, sobre os funis independentes existentes.

## Onde consultar

- **Dashboard → Últimas publicações**: produto, plataforma, destino, data efetiva, status e acesso à oferta. O cartão “Ofertas publicadas” leva até essa seção. Os filtros de Telegram, WhatsApp e período consultam o histórico de toda a conta, independentemente da página do catálogo.
- **Oferta ou detalhes do produto → Histórico de publicações**: consulta por canal e período, com paginação de 20 registros. A opção de incluir tentativas também mostra agendamentos, falhas, entregas incertas e registros em revisão. Não há mais limite de exibição de 50 eventos ou 10 confirmações nessa seção.
- **Publicações → Histórico e tentativas**: usa a mesma consulta, vinculada ao canal selecionado no funil.
- **Catálogo e produtos recentes**: última publicação separada por canal, confirmação manual do WhatsApp e indicação de republicação agendada. Datas ausentes aparecem como “Data indisponível”.

## Datas e destinos

Todos os horários de publicação são apresentados em `America/Bahia`. O filtro de período inclui o dia final inteiro no fuso da operação. O envio efetivo, a confirmação manual, o horário agendado e o registro de uma tentativa são identificados separadamente.

O banco passa a guardar em cada evento a data efetiva, o horário agendado, o ID do destino e a autorização de republicação. Novas transições para enviado usam o timestamp de confirmação do recibo no banco. As consultas não usam a criação da oferta como data de publicação.

O preenchimento dos eventos antigos usa comprovantes correspondentes à mesma rodada. Um evento legado sem horário de envio comprovado mantém a data efetiva nula, mesmo que tenha horário de criação. Essa data não é inventada e não entra em filtros por período. O catálogo também não substitui uma data desconhecida do registro mais recente pela data de uma publicação anterior.

O histórico Telegram mostra o nome salvo do canal e os IDs de todas as mensagens da publicação lógica. O link só é construído com ID de canal compatível e recibos positivos confirmados, no formato oficial de [links de mensagens Telegram](https://core.telegram.org/api/links#message-links). O nome do canal ou uma URL arbitrária não serve para gerar o link. A interface informa que é necessário ter acesso ao canal e que uma mensagem pode ter sido removida posteriormente.

No WhatsApp, é mostrada a data de `confirmed_at`, o destino e a identidade que confirmou. O usuário autenticado é identificado pelo email da própria conta; outro identificador histórico permanece como ID, sem consultar nem expor dados de outras contas. A interface diz explicitamente que a confirmação manual não é um comprovante de envio da plataforma.

## Republicações e segurança

O histórico usa os eventos preservados por rodada Telegram e as confirmações WhatsApp existentes. Rodadas anteriores permanecem acessíveis; o catálogo mostra apenas a última. Uma rodada autorizada por intenção de republicação recebe identificação visual própria. Não se deduz uma republicação intencional apenas pela repetição de nomes ou horários.

Continuam valendo a autorização de uso único, a prevenção de cliques duplicados e o bloqueio de reenvios incertos. Copiar e abrir WhatsApp não cria confirmação. Nenhuma publicação em um canal confirma o outro.

A API `/api/publication-history` exige sessão válida e usa uma função `security invoker`, com filtro de proprietário e RLS. Não há acesso anônimo. A consulta é de leitura e não chama Telegram, WhatsApp ou OpenAI. O histórico detalhado carrega ao abrir; a seção do dashboard carrega imediatamente. Consultas abertas são atualizadas ao recuperar foco e a cada 30 segundos enquanto a página estiver visível, descartando respostas de filtros anteriores.

## Validação e implantação

- **155 testes passaram**, incluindo 55 rodadas paginadas sem duplicações, separação de canais, confirmação manual, destinos históricos, datas desconhecidas, limites de dias em Bahia, links inválidos, filtros, respostas atrasadas e RLS.
- TypeScript, build de produção e verificação de diferenças passaram. O azul atual foi preservado e não houve alteração de dependências, modelos, orçamento ou chaves.
- Migração local: `20261110131227_publication_history_destinations.sql`; aplicada no Supabase como `20261110133134_publication_history_destinations`.
- A verificação real retornou os cinco comprovantes Telegram com destino e data efetiva. As 15 linhas de auditoria foram mantidas. A assinatura dos recibos antes e depois permaneceu igual, assim como os totais: cinco entregas Telegram, zero confirmações WhatsApp e nove registros de requisição de IA. A automação continuou ativa e não foi reconfigurada.
- Não houve novas publicações reais nem chamadas pagas durante os testes. O navegador não estava conectado às ferramentas; a interface foi validada por renderização e interações simuladas, sem capturas visuais reais.
- Não surgiram novos avisos de segurança. Permanecem os avisos anteriores de tabelas privadas com RLS sem políticas públicas e de [proteção contra senhas vazadas desativada](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection).

Publicação da interface em andamento.

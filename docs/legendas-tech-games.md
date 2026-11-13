# Legendas e agendamento — Dropou | Tech & Games

O novo modelo é exclusivo de Dropou. Bruto & Barato, Moda Masculina e os perfis femininos conservam seus templates e regras anteriores. Não depende de IA paga.

## Publicar e agendar

1. Em **Automação de Ofertas → Elegíveis**, aprove o produto. Ele passa para **Próximos posts**, com rascunho preparado.
2. Clique em **Agendar**. O mesmo botão está visível no catálogo e nos produtos recentes. O pop-up mostra os próximos horários de `routine_slots` da marca, hoje/amanhã, em America/Bahia. Você também pode informar outra data.
3. Confira a loja e clique em **Conferi agora**. A confirmação cobre o preço registrado, disponibilidade e condições. Edite/revalide o produto se o valor da loja mudou.
4. Confira a legenda e a apresentação no Telegram. Foto exige arquivo e autorização; texto e prévia de link continuam disponíveis. Salve a versão final se houver edição.
5. Confirme o agendamento ou **Publicar agora no Telegram**. Abrir o pop-up, preparar, copiar e salvar não enviam mensagens. WhatsApp continua manual.

O preço permanece na legenda do Dropou. Sem conferência válida, o envio fica bloqueado. A conferência humana dura até 15 minutos: se vencer antes de um agendamento manual, ele ficará aguardando nova validação/autorização, sem retirar o preço silenciosamente. O worker Shopee mantém sua revalidação oficial orçada; se não conseguir confirmar o preço, retém o envio, inclusive com uma configuração antiga `stalePolicy=omit`.

O destino precisa estar verificado e a automação da marca ativa para processar agendamentos futuros. Isso não é ativado pelos botões de geração de legenda ou testes.

## Texto e rotação

`src/lib/dropou-captions.ts` define templates locais para jogos, consoles, controles/acessórios, periféricos, hardware e gadgets. O resumo conserva nome/modelo e extrai apenas especificações literais do título ou características marcadas como verificadas. Não cria compatibilidade, capacidade, Hz, avaliações ou descontos.

O preço principal aparece em destaque como **POR APENAS R$ …**. Preço anterior só aparece quando comprovado pelos dados existentes; percentuais informados pela Shopee não são usados para inventar um valor anterior. O rodapé é `#publi | Dropou 🎮`. O texto “Link de afiliado” foi retirado; a URL original de afiliado e seu rastreamento permanecem.

**Gerar outra chamada** substitui somente o primeiro parágrafo. Preço, link e o restante da edição manual permanecem idênticos. A nova versão precisa ser salva antes de publicar.

`dropou_caption_history` guarda seleções, não publicações fictícias. A RPC `dropou_caption_rotate` serializa escolhas por proprietário, exclui a chamada atual, a última selecionada e a última publicação confirmada, e prioriza frases menos recentes da categoria. Recibos Telegram e confirmações manuais existentes continuam sendo as provas de publicação. Escolhas e publicação são conceitos separados; editar ou reordenar manualmente os posts não reescreve seu conteúdo automaticamente.

## Banco e validação

- Migração local `20261112125940_shopee_priced_drafts.sql`, aplicada como `shopee_priced_drafts`, versão remota `20261113132316`. Atualiza a preparação explícita de rascunhos; não reescreve ofertas publicadas/editadas ou jobs existentes. `_draftCaption` é metadado do servidor e não integra o cadastro do produto.
- Migração local `20261112170713_dropou_caption_rotation.sql`, aplicada como `dropou_caption_rotation`, versão remota `20261113132319`. RLS por proprietário/marca, execução da RPC exclusiva de `service_role`, política de leitura e índice do histórico. Clientes não inserem diretamente.
- Rotação remota validada em transação com rollback; grants e RLS conferidos. Não reaplicar schema/seeds ou migrações já aplicadas.

Resultados de testes, build e conferência visual em `VALIDACAO.md`. Integração Shopee, destino e histórico do redesign em [premium-dashboard.md](premium-dashboard.md).

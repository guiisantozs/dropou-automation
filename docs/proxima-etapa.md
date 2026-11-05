# Próxima etapa: consulta instantânea por fontes autorizadas

Só avançar após validar login e o fluxo manual no projeto Supabase do Dropou.

1. Obter autorização da plataforma e a documentação efetivamente liberada para a conta. Mercado Livre: manter links gerados no Portal de Afiliados. Shopee: aguardar aprovação da Open API apropriada ao programa de afiliados.
2. Implementar `lookup(url)`, `search(niches)` e `revalidate(product)` em `src/server/adapters.ts`, com credenciais somente no servidor. Nenhuma chamada genérica a URLs arbitrárias deve ser usada para buscar páginas.
3. Persistir o ID oficial do produto/variante e evidência de preço, estoque, condição de pagamento, origem e horário. Manter `null`/não verificado quando a fonte não fornecer um dado. Preço anterior depende de referência comprovável, não de sugestão comercial.
4. Ao falhar, mostrar erro de consulta e preservar os campos manuais já preenchidos. Não fabricar links nem substituir o preço por um valor estimado.
5. Criar testes de contrato com respostas autorizadas, expiração de credenciais, indisponibilidade, estoque desconhecido e alteração de preço. Revalidar no momento de preparar a publicação.
6. Só então avaliar ativar busca agendada. WhatsApp continua com cópia e publicação manual. Telegram só após teste em canal autorizado, com bloqueio de repetição e tratamento de entrega ambígua.

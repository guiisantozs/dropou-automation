# Prazo dos produtos salvos

- Um link fica em **Meus produtos salvos por sete dias**, contados do salvamento.
- Ao completar sete dias, passa para o **Catálogo**, mesmo se a consulta Shopee tiver falhado ou não houver oferta preparada. Essa mudança não aprova, agenda ou publica o produto.
- Fica no catálogo por **mais 14 dias**: o prazo total é de 21 dias desde o salvamento. Os prazos usam o relógio do banco, independentemente de o navegador ficar aberto.
- Após o prazo, o link salvo é excluído. Produtos e ofertas sem histórico são excluídos pelo fluxo transacional existente. Quando há publicação ou recibo, o produto é arquivado e os comprovantes históricos permanecem acessíveis.
- Agendamentos, envios pendentes e consultas oficiais em andamento são preservados. Depois de concluídos ou cancelados, o item vencido fica elegível para a próxima limpeza.

O botão **Excluir** fica visível fora de “Dados e outras ações”, inclusive em cards sem foto/dados ou com erro. A confirmação remove o item dos salvos e do catálogo e preserva históricos. Não cancela um agendamento silenciosamente: nesse caso a interface pede cancelá-lo na oferta primeiro.

A manutenção usa o dispatcher já existente e continua quando os envios estão pausados; não cria outro cron. As listagens também atualizam os prazos do proprietário/canal autenticado. Cada passagem processa lotes limitados, sem chamadas à Shopee, Telegram ou IA. A ordem de locks é produto antes de link, como na preparação existente. Imagens de produtos excluídos passam pela limpeza de arquivos sem referências; arquivos compartilhados e históricos são preservados.

Migração incremental: `20261114171303_saved_products_retention.sql`. As funções de manutenção/exclusão são restritas a `service_role`. As APIs verificam o usuário e o canal antes de chamá-las. O catálogo mantém RLS, filtros e paginação; produtos já preparados não aparecem duplicados pelos seus links.

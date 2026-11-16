# Dropou — plano de integração com espelhamento Telegram

**Situação:** somente especificação e protótipo local. Não integra Telegram, API, banco, Vercel ou filas hoje. O código de autenticação MTProto está em outra máquina e não deve ser presumido como versionado.

## Quando unir com o código de casa

1. No computador de casa, proteger primeiro as alterações locais: verificar git status; fazer commit em uma branch própria, sem reset, checkout forçado ou substituição de arquivos. Não enviar tokens, sessões MTProto ou env locais.
2. Fazer fetch das branches remotas. Conferir diferenças entre a branch do Telegram e feat/mercado-livre-browser-poc. A extensão está em experiments/mercado-livre-extension/; preservar essa separação antes de integrar.
3. Testar a extensão no Chrome pessoal e confirmar a criação real do link na sua conta/etiqueta do Mercado Livre. Link meli.la capturado não significa comissão comprovada.
4. Só então definir um canal autenticado de comunicação entre o backend Dropou e a extensão, para receber tarefas de conversão quando explicitamente habilitada. Não transportar cookies do Mercado Livre, nem salvar perfis do Chrome no Supabase/Vercel.
5. Integrar uma fila com deduplicação e controle de estado. Um trabalho capturado do Telegram não pode ser enviado diretamente ao Telegram de destino sem confirmação de link correto, preço vigente e regras de publicação.
6. Fazer testes de ponta a ponta em ambiente de teste, sem postar em grupos reais até autorização específica.

## Contrato futuro proposto

Entrada (backend para conversor):
```json
{
  "requestId": "uuid",
  "marketplace": "mercadolivre",
  "originalUrl": "https://www.mercadolivre.com.br/...",
  "expectedItemId": "MLB1234567890",
  "sourceChannelId": "identificador_da_origem",
  "sourceMessageId": "identificador_da_mensagem",
  "targetChannelId": "identificador_do_destino",
  "capturedAt": "2026-11-16T13:00:00Z"
}
```

Saída (conversor para backend):
```json
{
  "requestId": "uuid",
  "status": "candidate",
  "affiliateUrl": "https://meli.la/exemplo",
  "listingMatch": "unknown",
  "attribution": "unverified",
  "convertedAt": "2026-11-16T13:00:20Z"
}
```

Os exemplos são dados fictícios, não eventos reais. Identidades e autorização devem ser conferidas no backend; não confiar em payloads de terceiros. Link candidato não equivale a link verificado, e nem link verificado equivale a comissão garantida.

## Máquina desligada / extensão desligada

- O botão **Desligar** da extensão interrompe a criação de novas tarefas locais, fecha a aba de teste e remove a tarefa da memória temporária do navegador. A extensão inicia desligada em cada sessão do navegador.
- Quando a extensão estiver desligada, um backend futuro não deve enviar novas tarefas a ela; a fila ficará pendente/pausada.
- Trabalhos iniciados e interrompidos não devem ser publicados nem repetidos automaticamente em caso de resultado incerto.
- Chrome fechado ou PC desligado: nenhuma automação local do conversor pode executar, mesmo que o captador MTProto do Dropou continue ativo no servidor.
- A extensão não apaga histórico de navegação nem registros de rede/empresa. Para uso sem rastros no computador de trabalho, o caminho é não executar ali; usar computador pessoal autorizado ou solução hospedada apropriada e segura.

## Critérios para publicar ofertas

- Origem do grupo/canal autorizada e verificável.
- Link de destino corresponde ao anúncio correto; rastreamento de afiliado validado por método confiável.
- Preço atual, variantes e estoque conferidos pela fonte permitida; nunca presumir preço da mensagem antiga.
- Deduplicação por origem, anúncio e destino. Registrar falhas/retries idempotentes.
- Limites por marketplace, tratamento de captcha/login manual e suspensão automática em falhas persistentes.
- Separar captura, conversão, revisão de preço, geração da legenda e publicação.

## Próximas entregas

1. Validar e estabilizar extensão local; verificar resultado e link de destino no painel real.
2. Integrar fila com MTProto quando o código de casa estiver salvo/mesclado com segurança.
3. Implementar monitoramento de sucesso/erro por grupo e publicação em ambiente de testes.
4. Resolver a operação com computador desligado com solução autorizada e credenciais protegidas (não transferir o perfil/cookies do Chrome para um servidor).

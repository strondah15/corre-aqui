# Monetizacao comercial do Corre Aqui

## Produtos canonicos

Os produtos comerciais ficam centralizados no servidor em
`src/lib/commercialProducts.js`.

```js
corre_aqui_professional_featured: {
  amountInCents: 999,
  currency: "BRL",
  type: "professional_featured",
  durationDays: 30
}

corre_aqui_request_boost: {
  amountInCents: 999,
  currency: "BRL",
  type: "request_boost",
  durationHours: 24
}
```

O frontend exibe `R$ 9,99`, mas nunca define preco, moeda, duracao, UID ou
status. Checkout e webhook usam Firebase Admin e validam tudo novamente.

## Perfil profissional em destaque

Fonte de verdade:

```text
featuredProfessionalEntitlements/{uid}
```

Formato:

```js
{
  active: true,
  status: "active",
  planId: "corre_aqui_professional_featured",
  profileReleased: true,
  accountSuspended: false,
  startsAt: 1780000000000,
  expiresAt: 1782592000000,
  regions: ["nova iguacu"],
  radiusKm: null,
  lastShownAt: null,
  createdAt: 1780000000000,
  updatedAt: 1780000000000,
  source: "mercado_pago",
  paymentReference: "external-reference",
  paymentId: "payment-id"
}
```

Sem recorrencia segura configurada, a ativacao vale por 30 dias. O destaque
aumenta visibilidade e nao altera avaliacao, reputacao, servicos concluidos ou
posicao organica fora da area patrocinada.

## Pedido impulsionado

Fonte de verdade:

```text
featuredRequestEntitlements/{pedidoId}
```

Formato:

```js
{
  active: true,
  status: "active",
  productId: "corre_aqui_request_boost",
  pedidoId: "...",
  ownerUid: "...",
  startsAt: 1780000000000,
  expiresAt: 1780086400000,
  endsWhenAccepted: true,
  createdAt: 1780000000000,
  updatedAt: 1780000000000,
  source: "mercado_pago",
  paymentReference: "external-reference",
  paymentId: "payment-id",
  regionKeys: ["nova iguacu"],
  categoryId: "servicos_gerais",
  lastShownAt: null
}
```

O impulso termina por expiracao, aceite, cancelamento, finalizacao, bloqueio,
reembolso ou chargeback. A API `/api/featured-requests` recalcula a elegibilidade
em toda leitura e nao depende apenas do campo `active`.

## Rotacao

Profissionais usam a rotacao ja existente da API de destaques. Pedidos usam uma
janela menor de 2 horas, compativel com o ciclo de 24 horas do impulso, para
evitar que sempre os mesmos cards aparecam primeiro.

## Preview local

Variaveis:

```env
FEATURED_PROFESSIONALS_TEST_MODE=true
FEATURED_REQUESTS_TEST_MODE=true
```

Os modos de preview so funcionam quando `NODE_ENV !== "production"`. Eles usam
dados reais ja existentes, nao gravam entitlements, nao criam pagamento aprovado
e mostram selo `Previa`.

## Segurança

Os nos comerciais possuem leitura e escrita negadas nas regras do Realtime
Database. Somente rotas server-side com Firebase Admin criam checkout, validam
webhook e ativam ou encerram entitlements.
# Assinaturas trimestrais recorrentes

O Corre Aqui oferece um pedido gratuito ao Cliente. A gratuidade é consumida somente quando a rota autenticada `/api/pedidos/create` grava o pedido e o marcador `users/{uid}/clientFreeOrderUsed` na mesma atualização atômica. Pedidos seguintes exigem `subscriptions/client/status = active` e `expiresAt` futuro.

O período grátis de Profissional/Corre começa na primeira entrada no modo Trabalhar, pela rota `/api/subscriptions/status`, e dura exatamente 90 dias. Ações profissionais novas, como aceitar pedido ou responder solicitação privada, são verificadas no backend. Trabalhos, conversas e dados existentes não são apagados quando a gratuidade ou uma assinatura termina.

Planos Mercado Pago:

- `CLIENT_QUARTERLY`: R$ 19,90 a cada 3 meses, com renovação automática.
- `PROFESSIONAL_QUARTERLY`: R$ 49,90 a cada 3 meses, com renovação automática.

O preço do catálogo vale para novos checkouts. O webhook valida renovações pelo valor gravado na tentativa original, preservando o preço das autorizações existentes.

Registros anuais existentes continuam reconhecidos até sua validade original, mas não são oferecidos para novas contratações.

O checkout reutiliza `/api/planos/checkout` e cria uma autorização oficial em `/preapproval`, sem plano remoto associado. Preço, BRL, frequência de 3 meses e data inicial são definidos pelo servidor. O navegador precisa registrar consentimento explícito e nunca envia UID ou preço como autoridade.

Para testar assinaturas, configure `MERCADO_PAGO_STAGING_BUYER_EMAIL` somente no Preview da branch `codex/staging/consolidated-2026-09-07`, com o e-mail da conta compradora de teste do Mercado Pago, do mesmo país e distinta do vendedor de teste. Entre no Corre Aqui com a conta Firebase que deve receber o benefício e conclua o checkout no Mercado Pago com a conta compradora e um cartão de teste. A tentativa e a assinatura continuam vinculadas ao UID verificado no servidor.

A autorização recorrente registra o estado da renovação. O benefício pago exige um pagamento `approved` consultado diretamente no Mercado Pago. Webhook e reconciliação por demanda ou agendada usam o mesmo processamento de pagamentos. O webhook `/api/mercado-pago/webhook` aceita `payment`, `subscription_preapproval` e `subscription_authorized_payment` com HMAC válido. O processamento confere referência, tentativa, produto, valor, moeda e recebedor. O ledger `processedPaymentEvents` e a transação do plano impedem que o mesmo pagamento estenda a vigência duas vezes. O histórico fica em `subscriptionPaymentHistory/{uid}/{kind}`.

O cancelamento passa por `/api/subscriptions/cancel`. Uma trava transacional por UID e tipo de plano evita envios concorrentes. O servidor confere a autorização e a tentativa, consulta `/preapproval/{id}` e pede o cancelamento no provedor quando necessário. Uma resposta incerta exige confirmação por leitura. O resultado só é sincronizado no plano associado à mesma autorização e preserva o fim da vigência paga. Estorno ou contestação do último pagamento encerram a vigência correspondente. Impulsionamentos e destaques continuam independentes.

## Reconciliação

- A consulta autenticada de Assinatura pode atualizar autorizações e pesquisar faturas do próprio usuário. A periodicidade server-side do Staging faz a recuperação sem sessão aberta, com agenda de 30 minutos vinculada à branch Staging e autenticação do job por segredo. A rota e o adaptador atuais exigem explicitamente Preview Staging.
- A fila `subscriptionReconciliationSchedule` recebe tentativas de checkout, prioriza autorizações pendentes e vencimentos e limita cada execução a oito autorizações. Ela mantém o cursor da página de faturas e reage a falhas transitórias e limites do provedor com novas tentativas espaçadas.
- A confirmação nativa deve reunir o ID da autorização, a fatura e o pagamento aprovado consultado no provedor, o HTTP da entrega, a auditoria gravada após o HMAC e a vigência no RTDB. Um `next_payment_date` comprova programação. Uma segunda cobrança efetiva exige fatura e pagamento com IDs próprios, vinculados à mesma autorização, com o pagamento `approved`.

## Ativação futura em Production

1. Validar a versão candidata, preservar backup e pontos de rollback de código e configuração e confirmar Firebase Client, Admin e RTDB no projeto `corre-aqui-3f9ec`. Manter o checkout fechado durante o preflight.
2. Confirmar manualmente o vendedor comercial, a aplicação, o token e o segredo HMAC do ambiente de produção. Configurar o webhook no domínio oficial para os três tópicos e testar a autenticação da entrega. Guardar credenciais exclusivamente no servidor e manter o comprador sandbox fora do escopo Production.
3. Validar reversão do deployment, desativação de novos checkouts e continuidade da reconciliação de pagamentos já iniciados. Antes de prometer recuperação com o app fechado também em Production, implementar e homologar explicitamente o agendamento para esse ambiente com credencial e alvo próprios.
4. Com autorização de lançamento, abrir o checkout de forma controlada. Monitorar entregas HMAC, fila de reconciliação, tempo até concessão, duplicidade, disputas e cancelamentos. Para recuar, fechar primeiro a criação de novos checkouts e preservar consulta, webhook e cancelamento das autorizações existentes.

## Notificacoes financeiras

Pagamento aprovado, falha, cancelamento e encerramento reutilizam a Central de Avisos das Notificacoes 2.0, com IDs determinísticos e materializacao idempotente nas raizes existentes. A flag server-side `SUBSCRIPTION_NOTIFICATIONS_ENABLED` permanece `false` por padrao no sandbox, portanto os testes nao enviam avisos financeiros reais. O modulo tambem reconhece os eventos de fim proximo da gratuidade e renovacao proxima para integracao futura com um acionador agendado, sem criar cron de cobranca.

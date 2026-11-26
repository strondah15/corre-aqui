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

A autorização recorrente não libera benefícios. A liberação ocorre exclusivamente depois de um pagamento `approved` consultado diretamente na API do Mercado Pago pelo webhook `/api/mercado-pago/webhook`. O webhook aceita os tópicos `payment`, `subscription_preapproval` e `subscription_authorized_payment`, sempre com HMAC válido, e confere referência, tentativa, produto, valor, moeda, recebedor e idempotência.

O cancelamento passa por `/api/subscriptions/cancel`, cancela futuras cobranças no `/preapproval/{id}` e preserva o acesso até o fim do período já pago. Estorno ou contestação do último pagamento encerram a vigência correspondente. Impulsionamentos e destaques existentes permanecem produtos independentes das assinaturas.

## Notificacoes financeiras

Pagamento aprovado, falha, cancelamento e encerramento reutilizam a Central de Avisos das Notificacoes 2.0, com IDs determinísticos e materializacao idempotente nas raizes existentes. A flag server-side `SUBSCRIPTION_NOTIFICATIONS_ENABLED` permanece `false` por padrao no sandbox, portanto os testes nao enviam avisos financeiros reais. O modulo tambem reconhece os eventos de fim proximo da gratuidade e renovacao proxima para integracao futura com um acionador agendado, sem criar cron de cobranca.

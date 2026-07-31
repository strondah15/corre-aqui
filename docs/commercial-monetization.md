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

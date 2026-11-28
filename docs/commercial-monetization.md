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
- A confirmação nativa deve reunir o ID da autorização, a fatura e o pagamento aprovado consultado no provedor, o HTTP da entrega, a auditoria gravada após o HMAC e a vigência no RTDB.
- `next_payment_date` comprova a programação. Para homologar a segunda cobrança efetiva, consulte uma fatura distinta e um novo pagamento `approved`, ambos vinculados à mesma autorização. O registro da primeira cobrança e o cancelamento da renovação podem ser comprovados separadamente.

### Pagamento aprovado com divergência de identidade

O checkout hospedado aceita pagamento sem conta Mercado Pago. A referência de criação de assinatura sem plano prevê a conferência do e-mail informado no checkout com o e-mail do pagador cadastrado. O Corre Aqui vincula a tentativa ao UID no servidor e usa os identificadores documentados da fatura para conferir a autorização e o pagamento. [Checkout de Assinaturas](https://www.mercadopago.com.br/developers/pt/docs/subscriptions/overview) · [Criação de assinatura](https://www.mercadopago.com.br/developers/en/reference/online-payments/subscriptions/create-preapproval/post.md) · [Consulta da fatura](https://www.mercadopago.com.br/developers/pt/reference/online-payments/subscriptions/get-authorized-payment/get.md)

Na homologação sandbox do plano Profissional em 28/11/2026, o teste como convidado apresentou divergência entre o pagador da autorização final e o pagador do pagamento. A autorização foi cancelada. No reteste com o comprador de teste autenticado, o ID retornado no estado pendente mudou ao autorizar a assinatura. O ID final coincidiu com o comprador do checkout e do pagamento aprovado. A referência pública de Assinaturas descreve os estados pendente e autorizado. A mudança do ID foi observada nesse reteste.

O Corre Aqui registra o pagador retornado na criação pendente como evidência da tentativa. A confirmação automática do pagador definitivo pertence ao primeiro pagamento aprovado daquela autorização. Para concluir essa etapa, o servidor exige a mesma autorização pendente registrada para o UID e a referência externa originais, a identidade da aplicação e do recebedor, os termos do plano e a seguinte cadeia consultada diretamente no provedor:

1. A autorização final confirma um meio de pagamento válido e identifica o pagador definitivo.
2. A fatura aponta para essa autorização em `preapproval_id` e para esse pagamento em `payment.id`.
3. O pagamento está `approved`, tem o mesmo pagador da autorização final e corresponde ao valor e à moeda da tentativa original.

A confirmação é feita uma única vez e preserva o pagador pendente para auditoria. O webhook de fatura e os reconciliadores por demanda e agendado recorrem ao mesmo processamento. O webhook genérico de pagamento pode receber o pagamento antes da fatura. Nessa ordem, o ledger mantém a divergência em revisão até a confirmação pelos recursos oficiais. O ledger continua responsável pela concessão idempotente. A identidade confirmada permanece vinculada às renovações e os registros legados continuam sujeitos à validação estrita. Uma divergência entre autorização final e pagamento permanece pendente de revisão, inclusive na primeira cobrança.

A recuperação automática está limitada ao Firebase Staging e ao Preview da branch Staging no projeto Vercel oficial. A configuração server-side `MERCADO_PAGO_STAGING_BUYER_BINDING_SHA256` deve conter o SHA-256 hexadecimal do e-mail já configurado do comprador de teste, normalizado em minúsculas e sem espaços nas pontas, seguido de LF e do ID oficial do mesmo comprador em decimal. Confirmar esse ID na identidade autenticada do Mercado Pago e manter a variável restrita à branch. O executor verifica o vendedor de teste com a mesma credencial usada para ler a autorização, a fatura e o pagamento. A referência e o UID vêm da tentativa registrada pelo servidor. Guardar o identificador anterior em `payerId` e o vínculo comprovado em `payerBinding`, com os IDs da fatura e do pagamento consultados. Uma rotação do comprador exige revisar as tentativas pendentes antes da troca.

O cancelamento de uma autorização cujo comprador ainda aguarda confirmação exige a mesma prova da autorização e do vendedor de teste. O cancelamento encerra a renovação sem confirmar o pagador definitivo. Uma cobrança anterior ao cancelamento só pode ser concedida após a prova completa da fatura e do pagamento, respeitando o mesmo ledger.

#### Revisão operacional

1. Acompanhar o aviso operacional `approved_payment_identity_review`. O ledger privado registra quais vínculos divergiram e quando a divergência foi observada. O reconciliador termina as verificações das outras faturas da página e mantém a fatura divergente pendente para releitura.
2. Consultar fatura, autorização e pagamento pelas APIs oficiais do mesmo ambiente. Conferir IDs, aplicação, recebedor, comprador, referência original da tentativa, produto, centavos, moeda e situação de estorno ou contestação.
3. Se uma resposta posterior do provedor confirmar todos os vínculos da **mesma tentativa**, deixar o reconciliador processar a fatura ou acionar a consulta autenticada de Assinatura. Verificar o pagador confirmado e uma única concessão. O ledger impede reaproveitar a revisão para associar esse pagamento a outra tentativa. O timestamp `identityReview.resolvedAt` registra que a divergência foi superada no processamento, e o estado do ledger indica se houve concessão.
4. Se o provedor continuar retornando dados incompatíveis, encaminhar o caso ao suporte com IDs e datas pelo canal autorizado e orientar o cliente a não tentar pagar novamente durante a análise. Preservar a tentativa e as evidências. Um eventual estorno segue o procedimento de devolução aprovado separadamente.

## Ativação futura em Production

1. Validar a versão candidata, preservar backup e pontos de rollback de código e configuração e confirmar Firebase Client, Admin e RTDB no projeto `corre-aqui-3f9ec`. Manter o checkout fechado durante o preflight.
2. Confirmar manualmente o vendedor comercial, a aplicação, o token e o segredo HMAC do ambiente de produção. Configurar o webhook no domínio oficial para os três tópicos e testar a autenticação da entrega. Guardar credenciais exclusivamente no servidor e manter o comprador sandbox fora do escopo Production.
3. Homologar separadamente uma comprovação independente da identidade do comprador comercial antes de habilitar recuperação automática em Production. O fluxo de teste permanece restrito ao Staging. Validar a rejeição de vínculos divergentes nas renovações, a idempotência e a continuidade da reconciliação com novos checkouts desativados. Homologar o agendamento de Production com credencial e alvo próprios.
4. Com autorização de lançamento, abrir o checkout de forma controlada. Monitorar entregas HMAC, fila de reconciliação, tempo até concessão, duplicidade, disputas e cancelamentos. Para recuar, fechar primeiro a criação de novos checkouts e preservar consulta, webhook e cancelamento das autorizações existentes.

## Notificacoes financeiras

Pagamento aprovado, falha, cancelamento e encerramento reutilizam a Central de Avisos das Notificacoes 2.0, com IDs determinísticos e materializacao idempotente nas raizes existentes. A flag server-side `SUBSCRIPTION_NOTIFICATIONS_ENABLED` permanece `false` por padrao no sandbox, portanto os testes nao enviam avisos financeiros reais. O modulo tambem reconhece os eventos de fim proximo da gratuidade e renovacao proxima para integracao futura com um acionador agendado, sem criar cron de cobranca.

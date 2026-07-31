# Profissionais em Destaque

## Fonte de verdade

Os planos válidos ficam exclusivamente em:

```text
featuredProfessionalEntitlements/{uid}
```

O `uid` precisa corresponder ao mesmo usuário publicado em
`publicProfiles/{uid}`. O frontend não lê o entitlement diretamente. A rota
autenticada `/api/featured-professionals` valida o registro com Firebase Admin
e devolve somente os campos necessários para a seleção.

## Formato canônico

```js
{
  active: true,
  status: "active", // active | expired | cancelled | suspended
  planId: "corre_aqui_professional_featured",
  profileReleased: true,
  accountSuspended: false,
  startsAt: 1780000000000,
  expiresAt: 1782678400000,
  regions: ["Nova Iguaçu - RJ"],
  radiusKm: 15, // opcional quando regions for usado
  lastShownAt: 1780100000000, // opcional
  createdAt: 1780000000000,
  updatedAt: 1780000000000,
  source: "mercado_pago", // mercado_pago | admin
  paymentReference: "referencia-do-provedor",
  paymentId: "id-do-pagamento"
}
```

Datas são armazenadas como timestamps em milissegundos. Durante a transição de
dados legados, a leitura aceita os aliases já existentes (`ativo`,
`perfilLiberado`, `contaSuspensa`, `inicioEm`, `expiraEm`, `validoAte`,
`regioes`, `raioKm` e `ultimaExibicaoEm`). Novas gravações devem usar somente os
nomes canônicos acima.

## Regras de elegibilidade

Um perfil só aparece quando:

- o entitlement está ativo, liberado, iniciado e ainda não expirou;
- a conta e o perfil público não estão suspensos ou ocultos;
- existe atuação como Corre ou Profissional;
- existe ao menos uma categoria ou serviço ativo no portfólio;
- a região ou o raio do plano atende o visitante;
- o perfil público correspondente existe.

Avaliação, total de avaliações e tempo de resposta vêm do perfil público real.
Campos ausentes são omitidos no card.

## Prévia local

Em desenvolvimento, habilite:

```env
FEATURED_PROFESSIONALS_TEST_MODE=true
```

Quando não existe entitlement ativo, a rota pode selecionar até dois registros
reais de `publicProfiles`. A autorização usada na resposta é temporária, recebe
`testMode: true` e não é gravada no Firebase. O card mostra o selo `Prévia`.

Há duas proteções contra uso indevido:

1. a variável é somente do servidor e não usa o prefixo `NEXT_PUBLIC_`;
2. a rota exige `NODE_ENV !== "production"` antes de considerar a variável.

Em produção, o modo de teste é ignorado mesmo que a variável seja configurada
por engano. Sem registros válidos, a seção permanece oculta.

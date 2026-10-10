# Contratos da API — Kurio

Fonte de verdade: [`src/api/contracts.ts`](../src/api/contracts.ts) (schemas zod compartilhados pelo
cliente e pelos handlers MSW) e [`src/api/endpoints.ts`](../src/api/endpoints.ts) (chamadas Axios e
chaves de cache). Toda resposta é validada no cliente com o schema correspondente: uma divergência de
contrato falha de forma explícita em vez de renderizar dados inválidos. As validações de entrada do
servidor simulado usam os mesmos schemas (erros 422 com mensagens por campo).

## Convenções

| Item | Regra |
| --- | --- |
| Base | `/api` (mesma origem; atendida pelo MSW). Timeout do cliente: 8 s. |
| Autenticação | `Authorization: Bearer <token>` (token devolvido por login/cadastro). |
| Carrinho de visitante | `X-Cart-Id: <uuid>` em toda requisição (gerado e guardado em `localStorage` `kurio.cartId`). Com sessão, o servidor usa o carrinho da conta. |
| Idempotência | `Idempotency-Key: <8–80 caracteres [A-Za-z0-9-]>`, obrigatório em `POST /api/orders`. |
| Valores em ETH | Strings decimais (`"1.19"`, `"0.0005"`), até 18 casas, aritmética em `bigint` (wei). Nunca `number`. |
| Quantidades | Inteiros positivos. |
| Datas | ISO 8601 (UTC). |
| Erros | `{ "error": { "code", "message", "fields"?, "details"? } }`. `fields` traz mensagens por campo; `details` traz dados extras (ex.: cotação nova em `QUOTE_STALE`). |

## Endpoints REST

Legenda de autenticação: **S** = sessão obrigatória; **O** = opcional (visitante usa `X-Cart-Id`); **—** = pública.

### Sessão e conta

| Método e rota | Auth | Corpo | Sucesso | Erros |
| --- | --- | --- | --- | --- |
| `POST /api/auth/register` | — | `RegisterInput { username, email, password }` | `201 Session` | 422 `VALIDATION_ERROR`, 409 `EMAIL_TAKEN` / `USERNAME_TAKEN` (com `fields`) |
| `POST /api/auth/login` | — | `LoginInput { email, password }` | `200 Session` | 422 `VALIDATION_ERROR`, 401 `INVALID_CREDENTIALS` |
| `GET /api/auth/session` | S | — | `200 Session` (sessão atual do token, com dados do usuário atualizados) | 401 `UNAUTHENTICATED` / `SESSION_EXPIRED` |
| `POST /api/auth/logout` | O | — | `204` (revoga o token enviado, se houver) | — |

`Session = { token, expiresAt, user: User }`. TTL padrão de 30 min (20 s no cenário `session-short`).
Expiração: qualquer chamada com token expirado ou revogado responde `401 SESSION_EXPIRED`.

### NFTs

| Método e rota | Auth | Parâmetros | Sucesso | Erros |
| --- | --- | --- | --- | --- |
| `GET /api/nfts` | — | `q`, `tab` (`new`/`trending`), `category` (repetível), `network` (repetível), `minPrice`, `maxPrice`, `sort` (`recent`/`price-asc`/`price-desc`/`popular`), `page` | `200 CatalogPage` | 400 `VALIDATION_ERROR`, 500 `INTERNAL` (cenário `server-error`) |
| `GET /api/nfts/:id` | — | — | `200 Nft` | 404 `NOT_FOUND` |

`CatalogPage = { items: NftSummary[], page, pageSize (9), total, totalPages, facets: { categories, networks, priceRange } }`.
As contagens de faceta ignoram a própria dimensão (as demais categorias continuam visíveis).
`Nft` acrescenta descrição, galeria, atributos e `editions: Edition[]`, onde
`Edition = { id, label, kind (limited|open), price, previousPrice, available, maxPerOrder }`.
`NftSummary.version` / `Nft.version` é a versão do recurso usada pelo tempo real.

### Favoritos

| Método e rota | Auth | Sucesso | Erros |
| --- | --- | --- | --- |
| `GET /api/me/favorites` | S | `200 { nftIds: string[] }` | 401 |
| `PUT /api/me/favorites/:nftId` | S | `200 { nftIds }` | 401, 404 `NOT_FOUND` |
| `DELETE /api/me/favorites/:nftId` | S | `200 { nftIds }` | 401, 404 `NOT_FOUND` |

### Carrinho

Todas as respostas devolvem o `Cart` inteiro, precificado pelo servidor:
`Cart = { id, version, items: CartItem[], coupon, subtotal, discount, networkFee, total, itemCount }`.
`CartItem.status` ∈ `ok | price-changed | insufficient-stock | sold-out` e `priceWhenAdded` explica uma
alteração de preço. Itens esgotados não entram no subtotal.

| Método e rota | Auth | Corpo | Sucesso | Erros |
| --- | --- | --- | --- | --- |
| `GET /api/cart` | O | — | `200 Cart` | 400 (sem `X-Cart-Id` e sem sessão) |
| `POST /api/cart/items` | O | `{ nftId, editionId, quantity }` | `201 Cart` | 422, 404 `NOT_FOUND`, 409 `EDITION_UNAVAILABLE` / `QUANTITY_LIMIT` / `OUT_OF_STOCK` |
| `PATCH /api/cart/items/:itemId` | O | `{ quantity }` | `200 Cart` | 422, 404, 409 `QUANTITY_LIMIT` / `OUT_OF_STOCK` |
| `DELETE /api/cart/items/:itemId` | O | — | `200 Cart` | 404 |
| `POST /api/cart/acknowledge` | O | — | `200 Cart` (aceita os preços atuais: `priceWhenAdded = price`) | — |
| `POST /api/cart/coupon` | O | `{ code }` | `200 Cart` | 422 `VALIDATION_ERROR` / `COUPON_INVALID` / `COUPON_EXPIRED` |
| `DELETE /api/cart/coupon` | O | — | `200 Cart` | — |
| `POST /api/cart/merge` | S | `{ guestCartId }` | `200 Cart` (itens do visitante movidos para a conta, quantidades limitadas por `maxPerOrder`/estoque) | 401, 422 |

`QUANTITY_LIMIT` e `OUT_OF_STOCK` trazem `details.max` / `details.available`.

### Cotação

| Método e rota | Auth | Corpo | Sucesso | Erros |
| --- | --- | --- | --- | --- |
| `POST /api/checkout/quote` | S | `{ network }` | `200 Quote` | 401, 422 `VALIDATION_ERROR` (carrinho vazio), 409 `OUT_OF_STOCK`, 422 `COUPON_EXPIRED` (cupom removido do carrinho) |

`Quote = { id, network, lines: QuoteLine[], coupon, subtotal, discount, networkFee, total, cartVersion, expiresAt }`.
Validade de 5 min; cada usuário tem uma única cotação ativa (a nova substitui a anterior).
A taxa de rede depende da rede: ethereum `0.016`, polygon `0.002`, solana `0.0005` ETH.

### Pedidos

| Método e rota | Auth | Corpo / parâmetros | Sucesso | Erros |
| --- | --- | --- | --- | --- |
| `POST /api/orders` | S | Header `Idempotency-Key`; `CreateOrderInput { quoteId, walletId, network, collector }` | `201 Order` (novo) ou `200 Order` + `Idempotent-Replay: true` (mesma chave e mesmo corpo) | 400 (chave ausente/inválida), 422 `VALIDATION_ERROR`, 409 `IDEMPOTENCY_CONFLICT`, 409 `QUOTE_STALE` (`details.quote` = cotação nova), 409 `OUT_OF_STOCK` |
| `GET /api/orders?status=pending` | S | `status` opcional | `200 { items: Order[] }` (só do usuário, mais recentes primeiro) | 401 |
| `GET /api/orders/:id` | S | — | `200 Order` | 404 `NOT_FOUND`, 403 `FORBIDDEN` (pedido de outra conta) |

Regras de criação:

1. Se a chave já existe: mesmo dono e mesmo hash do corpo → devolve o mesmo pedido (replay); caso
   contrário → `409 IDEMPOTENCY_CONFLICT`.
2. A cotação informada é comparada com uma recalculada no momento (validade, rede, total, linhas e
   cupom). Qualquer diferença → `409 QUOTE_STALE` com a cotação nova em `details.quote`.
3. O estoque é reservado e o pedido nasce `pending`. Ele liquida após ~2,5 s como `confirmed`
   (gera `txHash` e `explorerUrl` simulados e remove do carrinho **apenas** as quantidades compradas)
   ou `declined` (cenário `payment-declined`: devolve o estoque, carrinho intacto). Estados terminais
   não mudam mais.

`Order = { id, status, version, network, walletAddress, walletProvider, lines, coupon, subtotal, discount, networkFee, total, txHash, explorerUrl, declineReason, createdAt, updatedAt }`
é o recibo: um snapshot da cotação, que não muda com alterações posteriores do catálogo.

### Perfil

| Método e rota | Auth | Corpo | Sucesso | Erros |
| --- | --- | --- | --- | --- |
| `GET /api/me/profile` | S | — | `200 User` | 401 |
| `PATCH /api/me/profile` | S | `ProfileInput { displayName, username, email, ensName, walletNickname }` | `200 User` | 422, 409 `EMAIL_TAKEN` / `USERNAME_TAKEN` |
| `PUT /api/me/avatar` | S | `{ dataUrl }` (PNG/JPEG/WebP em data URL, redimensionado no cliente) | `200 User` | 422 |
| `DELETE /api/me/avatar` | S | — | `200 User` | 401 |
| `POST /api/me/password` | S | `{ currentPassword, newPassword, confirmPassword }` | `204` | 422 `VALIDATION_ERROR` (senha atual incorreta, confirmação divergente, nova igual à atual, regras de força) |

### Carteiras

| Método e rota | Auth | Corpo | Sucesso | Erros |
| --- | --- | --- | --- | --- |
| `GET /api/me/wallets` | S | — | `200 { items: Wallet[] }` | 401 |
| `POST /api/me/wallets` | S | `WalletInput & { role: primary\|secondary }` | `201 Wallet` | 422 (endereço inválido para a rede, secundária antes da principal), 409 `VALIDATION_ERROR` (papel já cadastrado; endereço já usado em outra carteira, com `fields.address`) |
| `PUT /api/me/wallets/:id` | S | `WalletInput` | `200 Wallet` | 404, 422, 409 (endereço duplicado) |
| `POST /api/me/wallets/:id/connect` | S | `{ network }` | `200 WalletConnection` (simulada) | 404, 422, 409 `WALLET_REJECTED` (cenário `wallet-rejected`) |
| `POST /api/me/wallets/:id/disconnect` | S | — | `204` | 401 |

Endereços: EVM `0x` + 40 hexadecimais (Ethereum/Polygon), base58 de 32–44 caracteres (Solana). O
endereço secundário aceita um nome `.eth` ou um endereço válido.

## Códigos de erro

| Código | HTTP | Quando |
| --- | --- | --- |
| `VALIDATION_ERROR` | 400 / 422 / 409 | Corpo ou parâmetros inválidos (400), validação de campos (422, com `fields`), carteira duplicada (409) |
| `INVALID_CREDENTIALS` | 401 | Login com e-mail/senha incorretos |
| `UNAUTHENTICATED` | 401 | Rota privada sem token |
| `SESSION_EXPIRED` | 401 | Token expirado ou revogado |
| `FORBIDDEN` | 403 | Recurso de outro usuário (pedido) |
| `NOT_FOUND` | 404 | NFT, edição, item, pedido ou carteira inexistente |
| `EMAIL_TAKEN` / `USERNAME_TAKEN` | 409 | Conflito no cadastro ou no perfil |
| `OUT_OF_STOCK` | 409 | Quantidade acima do estoque (carrinho, cotação, pedido) |
| `QUANTITY_LIMIT` | 409 | Acima de `maxPerOrder` da edição |
| `EDITION_UNAVAILABLE` | 409 | Edição esgotada ao adicionar |
| `COUPON_INVALID` / `COUPON_EXPIRED` | 422 | Cupom desconhecido / vencido |
| `QUOTE_STALE` | 409 | Cotação desatualizada na criação do pedido |
| `IDEMPOTENCY_CONFLICT` | 409 | Mesma `Idempotency-Key` com corpo (ou dono) diferente |
| `WALLET_REJECTED` | 409 | Conexão de carteira recusada (simulação) |
| `TRANSIENT` | 503 (+ `Retry-After: 1`) | Falha transitória (cenário `flaky`, falhas injetadas) |
| `INTERNAL` | 500 | Erro de servidor |

Códigos só do cliente (`ApiError`, status 0): `NETWORK_ERROR` (sem resposta), `TIMEOUT` (8 s),
`CANCELLED` (requisição abortada por uma consulta obsoleta). São considerados transitórios
(podem ser repetidos) `TRANSIENT`, `NETWORK_ERROR`, `TIMEOUT` e qualquer status ≥ 500.

## Eventos em tempo real (Socket.IO)

Conexão: `io(location.origin, { path: "/socket.io", transports: ["websocket"], query: { token } })`.
O token identifica o usuário no handshake; sem token a conexão recebe apenas eventos públicos.

Campos comuns:

| Campo | Significado |
| --- | --- |
| `type` | Nome do evento |
| `eventId` | Identidade estável: uma duplicata repete o mesmo `eventId` |
| `occurredAt` | Data ISO |
| `resource` | Recurso afetado: `{ type, id }` (+ `ownerId` em pedidos) |
| `version` | Versão monotônica do recurso; o cliente descarta `version ≤` à que já conhece |

### `nft.updated`

Emitido quando preço ou estoque de um NFT muda (painel/controle, cenários `price-change`/`sold-out`,
reserva de estoque na criação de pedido, devolução em pagamento recusado). Entregue a todas as conexões.

```json
{
  "type": "nft.updated",
  "eventId": "evt-…",
  "occurredAt": "2026-10-10T12:00:00.000Z",
  "version": 3,
  "resource": { "type": "nft", "id": "nft-042-0" },
  "data": {
    "price": "1.29",
    "previousPrice": null,
    "soldOut": false,
    "editions": [{ "id": "nft-042-0-e50", "price": "1.29", "previousPrice": null, "available": 7 }]
  }
}
```

### `order.updated`

Emitido na transição terminal do pedido (`confirmed` ou `declined`). Entregue apenas às conexões do
dono (`resource.ownerId`).

```json
{
  "type": "order.updated",
  "eventId": "evt-…",
  "occurredAt": "2026-10-10T12:00:02.500Z",
  "version": 2,
  "resource": { "type": "order", "id": "order-…", "ownerId": "user-ana" },
  "data": { "status": "confirmed", "order": { "…": "Order completo (snapshot)" } }
}
```

## Plano de controle dos mocks (`/__mock`)

Usado pelo painel "Cenários" e pelo Playwright. Altera o backend simulado; a interface só percebe as
mudanças pelas respostas REST e pelos eventos Socket.IO.

| Método e rota | Corpo | Efeito |
| --- | --- | --- |
| `GET /__mock/state` | — | Cenário atual, lista de cenários, sockets conectados, NFTs (preço/versão) e pedidos (status/versão) |
| `POST /__mock/scenario` | `{ id }` | Ativa um cenário (400 se desconhecido) |
| `POST /__mock/reset` | — | Restaura as fixtures e o cenário `default` |
| `POST /__mock/nfts/:id/mutate` | `{ priceDelta?, price?, available?, editionId? }` | Altera preço/estoque e emite `nft.updated` |
| `POST /__mock/fail-next` | `{ pattern, method?, status?=503, code?="TRANSIENT", count?=1 }` | As próximas `count` requisições cujo path casa com a regex `pattern` falham; `status: 0` simula erro de rede |
| `POST /__mock/sessions/expire` | — | Expira todas as sessões |
| `POST /__mock/socket/disconnect` | — | Derruba todas as conexões Socket.IO (o cliente reconecta sozinho) |
| `POST /__mock/events/duplicate` | — | Reenvia o último evento com o mesmo `eventId` |
| `POST /__mock/events/stale` | — | Envia uma versão antiga do último `nft.updated` com preço `999.99` |
| `POST /__mock/orders/:id/settle` | `{ outcome?: "confirmed" \| "declined" }` | Liquida um pedido pendente imediatamente |
| `POST /__mock/settle-delay` | `{ ms }` | Atraso de liquidação dos próximos pedidos (padrão 2500 ms) |

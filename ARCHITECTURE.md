# Arquitetura — Kurio

Este documento registra as decisões técnicas, a política de sessão, o estado do carrinho, a estratégia
de cache, a reconciliação entre REST e Socket.IO, as limitações e os desvios em relação ao Figma.
Setup e comandos estão no [`README.md`](README.md); contratos completos em [`docs/API.md`](docs/API.md).

## Visão geral

```
src/
  api/          contratos zod (contracts.ts) + chamadas Axios e query keys (endpoints.ts)
  lib/          cliente HTTP, sessão, aritmética ETH, QueryClient, utilitários
  app/          montagem, ciclo de vida da sessão, guards de rota
  realtime/     cliente Socket.IO (dedupe, versão, reconciliação)
  hooks/        hooks TanStack Query (catálogo, favoritos, carrinho, conta)
  features/     módulos por domínio (catalog, checkout, account, auth)
  routes/       rotas file-based do TanStack Router
  components/   layout, ui (shadcn/Base UI), painel de cenários, anunciador de tempo real
  mocks/        backend simulado: db, fixtures, handlers REST, servidor Socket.IO, cenários, /__mock
```

Fluxo de dados: componente → hook TanStack Query → `api.*` (Axios) → MSW (Service Worker) → `mocks/db`.
O caminho de volta em tempo real é `mocks/db` → `mocks/realtime` (Socket.IO sobre o WebSocket
interceptado pelo MSW) → `socket.io-client` → `RealtimeClient` → cache do TanStack Query. Componentes,
hooks e o cliente Axios não conhecem fixtures nem cenários.

## Decisões principais

| Decisão | Motivo |
| --- | --- |
| **Contratos zod compartilhados** (`src/api/contracts.ts`) usados pelo cliente (parse de toda resposta) e pelos handlers (validação de entrada) | Um único contrato tipado entre transporte, estado e UI; divergências falham explicitamente. |
| **ETH como string decimal** e cálculos em `bigint` com 18 casas (`src/lib/eth.ts`) | Precisão exata em somas, descontos e taxas; nenhum `number` para dinheiro. Exibição trunca (nunca arredonda para cima). |
| **O servidor precifica tudo** (carrinho, cotação, pedido) | A UI nunca recalcula totais: subtotal, desconto, taxa e total vêm da API. A cotação é a referência para finalizar. |
| **Uma instância Axios** (`src/lib/http.ts`) que converte tudo em `ApiError` com `code` estável | Retries, formulários e mensagens decidem por código, não por texto. Inclui timeout de 8 s, token, `X-Cart-Id` e detecção de expiração. |
| **Query keys privadas com namespace por usuário** (`["user", id, …]`) | Duas sessões nunca compartilham entrada de cache; o logout remove a subárvore inteira. |
| **Estado de busca na URL**, validado campo a campo pelo router | Busca, filtros, ordenação e página sobrevivem a refresh e histórico; valores inválidos são descartados sem quebrar a página. |
| **Rotas com code splitting automático** e preload por intenção | Bundle inicial menor; navegação rápida. |
| **Backend simulado como "servidor" de verdade** (`mocks/db.ts`), persistido em `localStorage` | Uma única fonte de verdade para REST e eventos, consistente entre catálogo, favoritos, carrinho, perfil, carteiras e pedidos. |
| **Plano de controle `/__mock`** para painel e testes | Testes e demonstração mudam o backend, nunca o estado React; a UI aprende só via REST e Socket.IO. |
| **Boot**: baixa e inicia o MSW antes do app, renderiza sem esperar; só a rede aguarda `mocksReady` | A UI estática e os skeletons aparecem cedo; nenhuma requisição escapa antes do mock estar ativo. Detalhes em `docs/PERFORMANCE.md`. |

## Contratos REST (resumo)

Tabela completa, códigos de erro e eventos em [`docs/API.md`](docs/API.md).

| Recurso | Rotas |
| --- | --- |
| Sessão e conta | `POST /auth/register`, `POST /auth/login`, `GET /auth/session`, `POST /auth/logout` |
| NFTs | `GET /nfts` (q, tab, category[], network[], minPrice, maxPrice, sort, page), `GET /nfts/:id` |
| Favoritos | `GET /me/favorites`, `PUT` / `DELETE /me/favorites/:nftId` |
| Carrinho | `GET /cart`, `POST /cart/items`, `PATCH` / `DELETE /cart/items/:id`, `POST /cart/acknowledge`, `POST` / `DELETE /cart/coupon`, `POST /cart/merge` |
| Cotação | `POST /checkout/quote` |
| Pedidos | `POST /orders` (com `Idempotency-Key`), `GET /orders?status=pending`, `GET /orders/:id` |
| Perfil | `GET` / `PATCH /me/profile`, `PUT` / `DELETE /me/avatar`, `POST /me/password` |
| Carteiras | `GET` / `POST /me/wallets`, `PUT /me/wallets/:id`, `POST /me/wallets/:id/connect` / `disconnect` |

Erros cobrem validação (400/422), sessão inválida (401), permissão (403), inexistente (404),
conflitos de disponibilidade/cadastro/idempotência/cotação (409) e falha transitória (503).

## Política de sessão

- **Armazenamento**: a `Session { token, expiresAt, user }` fica em `localStorage` (`kurio.session`) e é
  revalidada no boot com `GET /auth/session`. Erro de rede mantém a sessão otimista; 401 a encerra.
  Senhas nunca são guardadas no cliente; no mock ficam apenas como SHA-256 com salt.
- **TTL**: 30 min no mock (20 s no cenário `session-short`).
- **Expiração**: qualquer 401 `SESSION_EXPIRED`/`UNAUTHENTICATED` de uma chamada feita **com o token
  atual** dispara o fluxo de expiração (respostas atrasadas de uma sessão anterior são ignoradas).
  A sessão local é limpa, um toast avisa e o usuário vai para `/entrar?expired=true&redirect=<rota atual>`.
  Após o login, volta exatamente para onde estava.
- **Checkout com sessão expirada**: o formulário do pagamento é salvo em `sessionStorage` por usuário
  (`kurio.checkout.draft.<userId>`) e restaurado na retomada; o carrinho fica no servidor.
- **Rotas privadas** (`/pagamento`, `/pedido/:id`, `/perfil`, `/carteiras`, `/favoritos`) usam um
  `beforeLoad` que redireciona para `/entrar?redirect=…`. O router é invalidado a cada troca de
  identidade para reavaliar o acesso.
- **Logout local-first**: a sessão local é apagada primeiro e só depois o servidor é avisado com o token
  antigo, de modo que sair da página logo após "Sair" nunca mantém o usuário logado.
- **Troca de identidade** (login, logout, expiração, troca de usuário), tratada de forma síncrona dentro
  de `sessionStore.set()` (`src/app/session-lifecycle.ts`):
  1. remove do cache toda a subárvore `["user", <id anterior>]` e todos os carrinhos;
  2. limpa o cache de mutations ao trocar de usuário (mutations pendentes não caem no cache do novo usuário);
  3. fecha o socket, remove todos os listeners e reconecta com o novo token;
  4. no login, mescla o carrinho do visitante na conta (`POST /cart/merge`) e gera um novo id de visitante.

## Estado do carrinho

- **Fonte de verdade no servidor.** O cliente guarda apenas o id do carrinho de visitante
  (`localStorage` `kurio.cartId`, enviado em `X-Cart-Id`). Com sessão, o servidor usa o carrinho da conta.
  Isso garante persistência após refresh e entre dispositivos simulados.
- **Login preserva os itens do visitante**: `POST /cart/merge` soma quantidades respeitando
  `maxPerOrder` e estoque e mantém o cupom do visitante se a conta não tiver um.
- **Cache**: `["cart", <userId | "guest">]`, `staleTime` de 10 s. Mutations substituem o cache pela
  resposta do servidor (que traz o carrinho inteiro, precificado).
- **Remoção otimista** com rollback: a linha some na hora; em falha volta e um toast informa.
  O feedback vive no hook (callbacks de `mutate()` são descartados quando o componente desmonta).
- **Alterações em tempo real**: `nft.updated` invalida o carrinho; o servidor marca cada item como
  `price-changed`, `insufficient-stock` ou `sold-out` (com `priceWhenAdded` para explicar a mudança).
  A UI avisa e "Entendi" (`POST /cart/acknowledge`) aceita os novos preços. Itens esgotados não entram
  no subtotal e bloqueiam a cotação.
- **Após o pedido**: só a confirmação remove itens, e apenas as quantidades compradas. Recusa ou falha
  preservam o carrinho.

## Estratégia de cache, retries e sincronização

Configuração em `src/lib/query-client.ts` e nos hooks (`src/hooks/data.ts`, `src/features/checkout/orders.ts`).

| Aspecto | Política |
| --- | --- |
| `staleTime` | 30 s por padrão; carrinho 10 s. Catálogo e detalhe ficam frescos também pelos eventos `nft.updated`. |
| `gcTime` | 5 min. |
| Retries de queries | Só falhas transitórias (`NETWORK_ERROR`, `TIMEOUT`, `TRANSIENT`, ≥ 500), no máximo 2, backoff exponencial `min(500·2ⁿ, 4000)` ms. 4xx nunca é repetido. 404 do detalhe vai direto para a tela de inexistente. |
| Retries de mutations | Desligados por padrão (nem todas são idempotentes). A criação de pedido repete explicitamente com a mesma chave. |
| Refetch | Ao focar a janela (queries ativas) e na reconexão do socket. Pedido pendente faz polling REST de 5 s como rede de segurança. |
| Respostas obsoletas | O `AbortSignal` do TanStack Query é repassado ao Axios: consultas obsoletas são canceladas, e uma resposta atrasada só pode cair na própria chave (que inclui todos os parâmetros), nunca na tela atual. O catálogo usa `keepPreviousData` com `aria-busy` durante a troca. |
| Isolamento | Chaves privadas com `userId`; chaves públicas com os parâmetros da consulta. |
| Atualização otimista | Favoritos (o coração muda na hora; rollback e toast em falha) e remoção do carrinho. |
| Invalidação | Mutations gravam a resposta do servidor no cache; carteiras são invalidadas após salvar; perfil atualiza também a sessão; `order.updated` grava o pedido e invalida pedidos pendentes e carrinho. |

### Pedidos sem duplicação (idempotência)

- Uma `Idempotency-Key` por tentativa de compra, ou seja, **por cotação**, persistida em
  `sessionStorage` (`kurio.checkout.attempts`). Clique duplo, retries após timeout e até um refresh
  reutilizam a mesma chave e recebem o mesmo pedido.
- Retries automáticos apenas para `TIMEOUT`, `NETWORK_ERROR` e `TRANSIENT` (até 3 tentativas, espera
  crescente). Os demais erros vão para o usuário.
- Mesma chave com corpo diferente → `409 IDEMPOTENCY_CONFLICT`. Por isso uma cotação nova (preços
  mudaram e o usuário confirmou de novo) recebe chave nova.
- `QUOTE_STALE` traz a cotação nova em `details.quote`: a revisão é atualizada com o novo total e exige
  nova confirmação.
- O botão "Confirmar e pagar" fica desabilitado durante o envio (incluindo os retries), e a página de
  pagamento continua montada enquanto houver envio em andamento (`useIsMutating`), mesmo que o carrinho
  esvazie nesse meio-tempo.
- Pedidos pendentes (`GET /orders?status=pending`) bloqueiam uma nova compra e sobrevivem a refresh:
  `/pagamento` mostra "Você tem um pedido em processamento" com link para acompanhar.
- A navegação para o pedido acontece no `onSuccess` do hook (não do componente), para funcionar mesmo
  que a tela de checkout desmonte.
- A tela de confirmação só aparece para `status: "confirmed"`; o recibo renderiza o snapshot do pedido.

## Tempo real (Socket.IO)

### Eventos

`nft.updated` e `order.updated` carregam `eventId` (identidade estável), `resource { type, id[, ownerId] }`
e `version` (monotônica por recurso). Formatos em [`docs/API.md`](docs/API.md#eventos-em-tempo-real-socketio).

| Evento | Efeito no cliente (`src/realtime/socket.ts`) |
| --- | --- |
| `nft.updated` | Atualiza as edições do detalhe, o resumo do NFT em todas as páginas de catálogo em cache e invalida o carrinho (o servidor reprecifica). Anuncia "ficou mais caro/mais barato/esgotou". |
| `order.updated` | Grava o pedido no cache, invalida pedidos pendentes e carrinho e anuncia confirmação ou recusa (região `aria-live` assertiva + toast). |

### Garantias do cliente

- **Duplicatas**: descartadas por `eventId` (janela dos últimos 500).
- **Eventos antigos**: descartados se `version ≤ max(versão já vista, versão no cache)`; nenhum estado
  regride e nenhum efeito é reaplicado.
- **Isolamento por usuário**: eventos de pedido cujo `ownerId` não é o usuário atual são ignorados
  (além do filtro no servidor).
- **Ciclo de vida**: a cada troca de sessão o socket é fechado, todos os listeners (do socket e do
  manager) são removidos, as tabelas de dedupe/versão são zeradas e uma nova conexão é aberta com o
  novo token. Um contador de geração descarta conexões tardias de um login/logout rápido.
- **Feedback acessível**: `RealtimeAnnouncer` converte os avisos em regiões `aria-live` e mostra
  "Reconectando ao tempo real…" durante a queda.

### Reconciliação REST ↔ Socket.IO

- Na **reconexão** (qualquer `connect` após o primeiro), o cliente invalida e refaz as consultas
  **ativas** de catálogo, detalhe, carrinho e pedidos: o que mudou enquanto estava offline vem da API.
- **Pedido pendente** tem polling REST de 5 s enquanto `pending`; após refresh, o pedido é lido por REST
  e o estado terminal chega por evento ou por polling, o que vier primeiro (a versão impede regressão).
- **Checkout**: com a revisão aberta, um `nft.updated` invalida o carrinho; se `cart.version` difere de
  `quote.cartVersion`, a revisão é marcada como desatualizada e a confirmação fica bloqueada até renovar
  a cotação. Se a mudança acontecer entre a cotação e o envio, o servidor recusa com `QUOTE_STALE`.
- O servidor simulado é a mesma instância que responde ao REST e emite os eventos, logo as duas vias
  sempre concordam.

### Transporte no ambiente de mocks e limitações

O servidor Socket.IO roda dentro do MSW (`src/mocks/realtime.ts`) com `@mswjs/socket.io-binding`, que
fala o protocolo Socket.IO real com o `socket.io-client`.

- **Somente WebSocket**: o MSW intercepta WebSocket, não o long-polling HTTP do Engine.IO. O cliente usa
  `transports: ["websocket"]` (sem handshake por polling e sem fallback).
- **msw fixado na linha 2.x**: `@mswjs/socket.io-binding` 0.2 exige `msw ^2.10.2` (a versão 3 havia sido
  instalada inicialmente).
- **`ws.link("*")`**: o msw 2.15 não casa um padrão de URL quando a query string do Socket.IO está
  presente, então o link escuta todas as conexões e filtra por `/socket.io` no handler. Sockets que não
  são Socket.IO (ex.: HMR do Vite) são repassados ao servidor real com `connection.server.connect()`.
- **Import tardio do `socket.io-client`**: o engine.io captura o construtor `WebSocket` na avaliação do
  módulo; ele precisa ver o construtor já substituído pelo MSW. Por isso o cliente é importado
  dinamicamente só depois de `mocksReady`.
- **Sem rooms/namespaces** no binding: a entrega por usuário é feita no mock, comparando o
  `ownerId` do evento de pedido com o usuário do token informado no handshake. `nft.updated` é público.
- O "servidor" vive na aba: cada aba tem sua própria instância (o estado é compartilhado via
  `localStorage` apenas na carga), e timers de liquidação só correm com a aba aberta. Ao recarregar,
  pedidos pendentes são reagendados (e liquidam na hora se o prazo já passou).
- A identidade do socket é fixada no handshake; trocar de usuário exige reconectar (o que o cliente
  faz automaticamente).

## Mocking (MSW)

- `src/mocks/db.ts`: estado do backend (catálogo, usuários, sessões, carrinhos, favoritos, carteiras,
  cotações, pedidos, chaves de idempotência), persistido em `localStorage` (`kurio.mock.db.v1`).
  `reset()` restaura as fixtures integralmente.
- `src/mocks/fixtures.ts`: 40 NFTs gerados com PRNG de semente fixa (incluindo os 8 do Figma, com nomes
  e preços originais), 9 categorias, 3 redes, edições `1/10`, `1/50` e `Aberta`, casos de borda (NFT
  totalmente esgotado, edição indisponível, estoque baixo), 2 usuários, 3 cupons e taxas por rede.
- `src/mocks/handlers.ts`: toda rota passa por `route()`, que aplica latência, offline, falha injetada e
  503 do cenário, resolve a sessão e mapeia erros para o corpo padrão.
- `src/mocks/scenarios.ts`: cenários determinísticos (lista no README). `src/mocks/control.ts`: `/__mock`.
- O mesmo build (com mocks) é usado em desenvolvimento, demonstração, deploy, Playwright e Lighthouse.
  `VITE_ENABLE_MOCKS=false` remove o MSW e o painel.

## Decisões de UX e acessibilidade

- **Skeletons com shimmer** no catálogo, detalhe, resumo do carrinho, pagamento e pedido, com as
  dimensões do conteúdo final (sem CLS). `prefers-reduced-motion` desliga shimmer, transições e scroll
  suave.
- **Feedback de mutations** por toast (sonner) e de tempo real por regiões `aria-live`.
- **Formulários**: validação com os mesmos schemas zod do contrato, erros associados aos campos
  (`aria-describedby`/`aria-invalid`), foco no primeiro campo inválido e erros da API (`fields`)
  mapeados para os campos. A validação no blur é pulada quando o foco vai para o botão de envio (evita
  que a mensagem desloque o botão sob o ponteiro).
- **Diálogos e drawers** (Base UI) prendem o foco, fecham com Esc e devolvem o foco ao gatilho.
- **Link "Pular para o conteúdo"** e foco visível em todos os controles.
- **Estados não dependem só de cor**: badges e textos acompanham as cores de preço alterado, esgotado,
  pendente e recusado.
- **Checkout em duas etapas**: formulário + conexão de carteira na rede escolhida → revisão com a
  cotação do servidor → confirmação. A conexão é simulada (conectar, recusa, desconectar); trocar de
  rede exige nova conexão.
- **Pedido pendente** pode ser recarregado ou fechado: a página explica que o pedido não será duplicado.

## Desvios deliberados do Figma

| Desvio | Motivo |
| --- | --- |
| Login e cadastro são **rotas** (`/entrar`, `/cadastro`) em vez de modal sobre a home | Acesso direto, refresh e `?redirect=` funcionam; o retorno ao fluxo anterior é natural. |
| Ícones do arquivo renderizados com `currentColor` (geometria intacta) | Seguem as cores de estado (hover, ativo, desabilitado, foco). |
| Links editoriais do rodapé, "Criadores", "Aprenda", login social, newsletter, "Esqueceu a senha?" e itens da conta como Atividade, Ofertas, Arquivos baixados e Suporte | Fora do escopo do desafio. Permanecem visíveis para preservar o layout, mas anunciam "“…” não está disponível nesta demonstração." em vez de simular sucesso. |
| "Lista de interesse" implementada como `/favoritos` | É onde os favoritos persistidos do usuário são listados. |
| Artes dos NFTs convertidas de PNG (~2 MB, 1254×1254) para WebP 256/512/1024 px (6–73 KB) | Performance; mesma imagem, servida em tamanho adequado. Duas imagens do arquivo não usadas em nenhum frame foram descartadas. |
| "Igual à carteira principal" copia os dados de perfil da principal, mas não endereço nem apelido | Endereços devem ser únicos entre carteiras (o servidor recusa duplicados com 409). |
| Perfil, carteiras e confirmação em mobile | Sem frame mobile no Figma; seguem o mesmo sistema visual dos frames existentes. |

Referências dos frames e assets em [`docs/figma/README.md`](docs/figma/README.md).

## Bugs encontrados pela suíte E2E e corrigidos

| Bug | Correção |
| --- | --- |
| No cenário de timeout, o pedido confirmava antes da resposta lenta chegar: o carrinho esvaziava, o checkout desmontava e a navegação para o recibo se perdia | Navegação no nível do hook (`useCreateOrder`) e página mantida montada enquanto há envio em andamento. |
| Logout só limpava a sessão local depois da resposta do servidor: sair da página logo após "Sair" mantinha o usuário logado | Logout local-first; servidor avisado depois, com o token antigo. |
| Uma resposta tardia de `GET /auth/session` (validação do boot) podia ressuscitar a sessão após o logout | A resposta só é aplicada se o token atual ainda for o mesmo que foi validado. |
| Clicar em "Salvar" após digitar um valor inválido não fazia nada: a validação no blur inseria a mensagem e deslocava o botão sob o ponteiro | Validação no blur ignorada quando o foco vai para o botão de envio do formulário. |
| O coração de favorito não era clicável no hover: o `transform` do card criava um contexto de empilhamento e o link esticado cobria o botão | Ajuste de camadas do card. |
| O diálogo de busca controlado não devolvia o foco ao gatilho | `finalFocus` do Base UI configurado. |
| O feedback da remoção otimista do carrinho nunca aparecia (callbacks de `mutate()` são descartados quando a linha desmonta) | Feedback movido para o hook. |

## Limitações conhecidas

- Não há backend real: autenticação, carteiras, pagamentos e blockchain são simulados. `txHash` e o link
  de explorador são fictícios (`#simulated`).
- O backend simulado roda por aba (veja "Transporte"); duas abas abertas não trocam eventos entre si.
- Sem long-polling: ambientes que bloqueiem WebSocket não recebem eventos (o polling REST de pedidos
  pendentes e o refetch por foco ainda mantêm os dados corretos).
- Sessão persistida em `localStorage` (adequado para a demonstração; em produção seria cookie
  `HttpOnly`).

## Performance e Lighthouse

Os resultados detalhados, a metodologia (build otimizado, cenário padrão, 3 medições por página e
perfil, mediana), as versões das ferramentas, o ambiente e a análise das causas estão em
[`docs/PERFORMANCE.md`](docs/PERFORMANCE.md). A configuração versionada da auditoria está em
`lighthouse/config.json` e o script em `scripts/lighthouse.ts`.

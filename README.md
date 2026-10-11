# Kurio — Marketplace de NFTs

Solução do desafio frontend da Jungle Gaming (enunciado em [`docs/CHALLENGE.md`](docs/CHALLENGE.md)).
React 19 + TypeScript, TanStack Router/Query, Axios, Socket.IO, Tailwind CSS 4, shadcn/ui (Base UI),
MSW (REST + Socket.IO), Playwright e Lighthouse.

URL pública: (a definir no deploy)

| Documento | Conteúdo |
| --- | --- |
| [`ARCHITECTURE.md`](ARCHITECTURE.md) | Decisões, sessão, carrinho, cache, tempo real, limitações, UX e desvios do Figma |
| [`docs/API.md`](docs/API.md) | Contratos REST, códigos de erro, eventos Socket.IO e plano de controle `/__mock` |
| [`docs/PERFORMANCE.md`](docs/PERFORMANCE.md) | Metodologia, resultados e análise do Lighthouse |
| [`docs/figma/README.md`](docs/figma/README.md) | Frames de referência e assets extraídos do Figma |

## Setup

Requisitos: [Bun](https://bun.sh) 1.x (gerenciador de pacotes e runner dos scripts) e Chrome/Chromium
para o Lighthouse. Nenhum backend ou serviço privado é necessário: a API e o servidor Socket.IO são
simulados no navegador pelo MSW.

```bash
bun install                                  # usa o bun.lock versionado
bunx playwright install --with-deps chromium # só para os testes E2E
bun run dev                                  # http://localhost:5173 com mocks
```

## Variáveis de ambiente

| Variável | Onde | Padrão | Efeito |
| --- | --- | --- | --- |
| `VITE_ENABLE_MOCKS` | `.env` (build e dev) | `true` | Liga o backend simulado (MSW REST + Socket.IO) e o painel "Cenários". Fica ligado também no build de demonstração/deploy. `false` desliga os mocks (sem eles não há backend: as chamadas falham). |
| `CHROME_PATH` | `bun run lighthouse` | detectado pelo `chrome-launcher` | Caminho do Chrome usado na auditoria. |
| `LH_RUNS` | `bun run lighthouse` | `3` (de `lighthouse/config.json`) | Sobrescreve o número de medições por página/perfil. |
| `CI` | Playwright | — | Em CI: `retries: 1`, 2 workers, `test.only` proibido, não reutiliza servidor existente. |

## Comandos

| Comando | O que faz |
| --- | --- |
| `bun run dev` | Servidor de desenvolvimento (Vite) com mocks |
| `bun run dev:no-mocks` | Dev com `VITE_ENABLE_MOCKS=false` |
| `bun run build` | `tsc -b && vite build` (build otimizado em `dist/`, com mocks) |
| `bun run preview` | Serve o build em `http://localhost:4173` |
| `bun run typecheck` | Verificação de tipos (`tsc -b`) |
| `bun run lint` | `oxlint src e2e` |
| `bun run test:e2e` | Suíte Playwright (faz build + preview na porta 4173 automaticamente) |
| `bun run test:e2e:ui` | Playwright em modo UI |
| `bun run test:e2e:report` | Abre o relatório HTML (`playwright-report/`) |
| `bun run test:visual:update` | Regrava as baselines de regressão visual (`e2e/__screenshots__/`) |
| `bun run lighthouse` | Auditoria Lighthouse (sobe o preview se não estiver no ar); rode `bun run build` antes |

## Credenciais fictícias

As senhas são armazenadas no mock apenas como hash SHA-256 com salt (nunca em claro).

| Conta | Senha | Observação |
| --- | --- | --- |
| `ana@kurio.dev` (Ana Colecionadora) | `Kurio2026` | Já tem carteira principal (Ethereum, MetaMask): pronta para comprar |
| `bruno@kurio.dev` (Bruno Criador) | `Kurio2026` | Sem carteiras: exercita o cadastro de carteira antes do checkout |

Novas contas podem ser criadas em `/cadastro` (senha com 8+ caracteres, letra e número).

### Cupons e taxas

| Cupom | Efeito |
| --- | --- |
| `KURIO10` | 10% de desconto no subtotal |
| `GENESIS` | 0.05 ETH de desconto (limitado ao subtotal) |
| `EXPIRADO` | Cupom expirado → erro `COUPON_EXPIRED` |
| qualquer outro | `COUPON_INVALID` |

Taxa de rede por pedido: Ethereum `0.016` ETH, Polygon `0.002` ETH, Solana `0.0005` ETH.

## Cenários do backend simulado

### Seleção

Três formas equivalentes (todas alteram o *backend* simulado; a interface só percebe a mudança pelas
respostas REST e pelos eventos Socket.IO):

1. **URL**: `?scenario=<id>` em qualquer rota, por exemplo `http://localhost:5173/?scenario=slow`. O valor
   fica persistido no `localStorage` (`kurio.mock.scenario`) até ser trocado.
2. **Painel "Cenários"**: botão flutuante no canto inferior esquerdo. Permite trocar o cenário, alterar
   preço/estoque de um NFT, duplicar o último evento, enviar um evento antigo, derrubar a conexão
   Socket.IO, expirar sessões e resetar.
3. **HTTP**: `POST /__mock/scenario` com `{"id":"<id>"}` (por exemplo via DevTools:
   `fetch('/__mock/scenario',{method:'POST',body:JSON.stringify({id:'slow'})})`).

### Reset

O estado do backend simulado (catálogo, usuários, sessões, carrinhos, favoritos, carteiras, pedidos)
persiste no `localStorage` (`kurio.mock.db.v1`) para sobreviver a refresh. Para restaurar as fixtures
determinísticas e voltar ao cenário `default`:

- painel **Cenários → "Resetar cenário e dados"** (recarrega a página); ou
- `POST /__mock/reset`.

A sessão do usuário no cliente (`kurio.session`) não é apagada pelo reset, mas é invalidada pelo
servidor na próxima chamada (sessões são zeradas) e a interface pede novo login.

### Lista de cenários

| id | Nome | Comportamento |
| --- | --- | --- |
| `default` | Padrão | Latência realista (60–180 ms), tudo funcionando. |
| `slow` | Rede lenta | Todas as respostas levam 1,5–3 s (skeletons, feedback de carregamento). |
| `out-of-order` | Respostas fora de ordem | Consultas ao catálogo alternam 1,8 s e 0,2 s: uma busca antiga chega depois da nova. |
| `offline` | Sem conexão | Toda chamada à API falha com erro de rede. |
| `flaky` | Instável (503) | A cada 3 requisições à API, uma responde 503 `TRANSIENT`. |
| `server-error` | Erro no catálogo (500) | `GET /api/nfts` responde 500 `INTERNAL`. |
| `empty` | Catálogo vazio | A listagem não retorna resultados. |
| `session-short` | Sessão curta | Novas sessões expiram em 20 s (expiração durante navegação/checkout). |
| `price-change` | Preço muda no checkout | 1,5 s após gerar a cotação, o preço do primeiro item sobe 0.10 ETH (evento `nft.updated`). |
| `sold-out` | Edição esgota no checkout | 1,5 s após gerar a cotação, a edição do primeiro item esgota. |
| `payment-declined` | Pagamento recusado | Pedidos ficam pendentes e então são recusados. |
| `order-timeout` | Timeout ao criar pedido | O pedido é criado, mas a primeira resposta demora 12 s (o cliente expira em 8 s e reenvia com a mesma chave). |
| `wallet-rejected` | Carteira recusa conexão | A conexão da carteira no checkout é recusada. |

Os cenários são determinísticos: latências vêm de um PRNG com semente fixa (re-semeado ao trocar de
cenário) e as falhas de contadores de requisição. Além deles, `POST /__mock/fail-next` injeta falhas
pontuais nas próximas N requisições que casarem com um padrão (veja [`docs/API.md`](docs/API.md#plano-de-controle-dos-mocks-__mock)).

## Como reproduzir os fluxos de falha

Pré-condição comum para os fluxos de compra: entrar como `ana@kurio.dev` / `Kurio2026`, abrir um NFT
(ex.: `/nft/nft-042-0`), clicar em **COMPRAR**, seguir para o pagamento, **Conectar carteira** e
**Confirmar compra** para abrir a revisão.

| Fluxo | Como reproduzir | O que observar |
| --- | --- | --- |
| Skeletons / carregamento lento | `/?scenario=slow` | Skeletons com shimmer no catálogo, detalhe e resumo do carrinho, sem deslocamento de layout. |
| Respostas fora de ordem | `/?scenario=out-of-order`, digite uma busca e troque rapidamente filtros | A resposta lenta antiga nunca substitui a mais nova (requisições obsoletas são canceladas e as chaves de cache são por parâmetros). |
| Sem conexão | `/?scenario=offline` | Mensagem de falha de rede com "Tentar novamente"; troque para `default` no painel e tente de novo. |
| Falhas transitórias | `/?scenario=flaky` | 503 são repetidas automaticamente (até 2 vezes, backoff) sem intervenção. |
| Erro 500 | `/?scenario=server-error` | Erro no catálogo com nova tentativa; volte para `default` para recuperar. |
| Resultado vazio | `/?scenario=empty` ou uma busca sem resultados | Estado vazio (com "Limpar filtros" quando há filtros ativos). |
| NFT inexistente / rota inexistente | `/nft/nao-existe`, `/qualquer-coisa` | Páginas 404 com retorno ao início. |
| Conflito de cadastro | `/cadastro` com `ana@kurio.dev` ou usuário `ana_kurio` | Erro 409 associado ao campo (`EMAIL_TAKEN` / `USERNAME_TAKEN`). |
| Credenciais inválidas | `/entrar` com senha errada | `INVALID_CREDENTIALS` no formulário. |
| Acesso não autorizado | Sem sessão, abra `/perfil`, `/carteiras`, `/favoritos` ou `/pagamento` | Redireciona para `/entrar?redirect=…` e volta à rota após login. |
| Sessão expirada | Logado, painel → **Expirar sessão** e navegue; ou `?scenario=session-short` antes de entrar | Aviso de sessão expirada, ida para `/entrar?expired=true&redirect=<rota atual>`; dados do formulário de pagamento são restaurados após novo login. |
| Cupom inválido/expirado | No carrinho, aplique `XYZ` ou `EXPIRADO` | Mensagem no campo do cupom; totais inalterados. |
| Limite de quantidade / edição esgotada | Detalhe de um NFT, aumente a quantidade | O stepper trava em `maxPerOrder`/estoque; edições esgotadas ficam indisponíveis. |
| Favorito com falha (rollback) | Logado, `POST /__mock/fail-next` com `{"pattern":"^/api/me/favorites/","method":"PUT","status":503,"code":"TRANSIENT"}` e clique no coração | O coração muda na hora, volta ao estado anterior e um toast informa a falha. |
| Preço muda durante a navegação | Com item no carrinho e `/carrinho` aberto, painel → selecione o NFT → **Preço +0.10** | Aviso de alteração de preço, resumo atualizado; "Entendi" confirma o novo preço. |
| Preço muda no checkout | Painel → cenário `price-change`, depois abra a revisão | O evento chega com a revisão aberta: a confirmação fica bloqueada até renovar a cotação. Se o envio usar cotação antiga, o servidor responde `QUOTE_STALE` com a cotação nova e exige nova confirmação. |
| Edição esgota no checkout | Cenário `sold-out`, depois abra a revisão | Compra impedida; o carrinho sinaliza o item esgotado. |
| Carteira recusa conexão | Cenário `wallet-rejected`, **Conectar carteira** | Erro claro, "Tentar novamente" (volte ao `default` para conectar). "Desconectar" simula a desconexão. |
| Pagamento recusado | Cenário `payment-declined`, **Confirmar e pagar** | Pedido pendente → recusado (terminal); itens continuam no carrinho. |
| Timeout após criar pedido | Cenário `order-timeout`, **Confirmar e pagar** | O cliente expira em 8 s e reenvia com a mesma `Idempotency-Key`; o servidor devolve o mesmo pedido (`Idempotent-Replay: true`). Existe um único pedido no fim. |
| Clique repetido | Clique várias vezes em **Confirmar e pagar** | Um único pedido criado. |
| Desconexão do tempo real | Painel → **Derrubar conexão** | Aviso "Reconectando ao tempo real…", reconexão automática e reconciliação via REST. |
| Eventos duplicados/antigos | Painel → **Duplicar evento** / **Evento antigo** (após alguma mudança de preço) | Nada muda: duplicata ignorada por `eventId`, evento antigo (preço 999.99) descartado por versão. |
| Pedido pendente + refresh | `POST /__mock/settle-delay` com `{"ms":600000}`, confirme uma compra, recarregue a página e tente comprar de novo | O pedido continua pendente (sem duplicar); `/pagamento` mostra "Você tem um pedido em processamento". Conclua com `POST /__mock/orders/<id>/settle` `{"outcome":"confirmed"}`: o evento `order.updated` leva ao recibo. |
| Troca de usuário | Entre como Ana, adicione favoritos/carrinho, saia e entre como Bruno | Nenhum dado privado da Ana aparece; o socket é recriado com a nova identidade. |

## Testes

- E2E em `e2e/`, executados contra o **build de produção com mocks** (o mesmo artefato do deploy), em
  Chromium nos projetos `desktop` (1440×900) e `mobile` (Pixel 7, 390×844).
- Cada teste usa um contexto de navegador novo (storage e Service Worker limpos), portanto um backend
  simulado isolado e determinístico.
- Relatório HTML em `playwright-report/` (`bun run test:e2e:report`); traces e screenshots são retidos
  apenas nas falhas (`test-results/`).
- Regressão visual (`e2e/visual.spec.ts`) de início, detalhe, carrinho e pagamento nos dois viewports,
  com baselines versionadas em `e2e/__screenshots__/`.

| # | Cenário exigido (seção 9) | Spec |
| --- | --- | --- |
| 1 | Busca, filtros, ordenação, paginação, histórico | `e2e/01-catalog.spec.ts` |
| 2 | Acesso direto ao detalhe e recurso inexistente | `e2e/02-detail.spec.ts` |
| 3 | Cadastro, login, expiração, logout, troca de usuário | `e2e/03-auth.spec.ts` |
| 4 | Favoritos com falha de mutation e recuperação | `e2e/04-favorites.spec.ts` |
| 5 | Carrinho, quantidades, remoção, cupom, persistência | `e2e/05-cart.spec.ts` |
| 6 | Compra completa até o recibo | `e2e/06-purchase.spec.ts` |
| 7 | Pagamento recusado, clique repetido, timeout | `e2e/07-payment-failures.spec.ts` |
| 8 | Perfil, avatar, senha e carteiras | `e2e/08-account.spec.ts` |
| 9 | Preço/disponibilidade via Socket.IO no checkout | `e2e/09-realtime-checkout.spec.ts` |
| 10 | Eventos duplicados/antigos, desconexão, pedido pendente | `e2e/10-realtime-resilience.spec.ts` |
| 11 | Teclado, foco de diálogos, validação | `e2e/11-accessibility.spec.ts` (desktop) |
| 12 | Skeletons, falha e nova tentativa | `e2e/12-loading-errors.spec.ts` |
| — | Cenários sensíveis a tempo com **relógio controlado** (`page.clock`): expiração de sessão no checkout com retomada, liquidação do pedido, validade da cotação | `e2e/13-clock.spec.ts` |
| — | Todas as telas em 390 / 768 / 1440 px e zoom de 200% sem overflow horizontal | `e2e/responsive.spec.ts` (desktop) |
| — | Regressão visual | `e2e/visual.spec.ts` |

Resultado atual: **116 testes passando** a partir de um checkout limpo (14 pulados de propósito: teclado
e varredura de larguras rodam só no projeto desktop, que controla o viewport explicitamente).
Para rodar com a porta 4173 ocupada (por exemplo, com um `preview` aberto): `E2E_PORT=4180 bun run test:e2e`.

Os testes controlam o backend apenas pelo plano de controle `/__mock` (via `fetch` da própria página →
Service Worker): troca de cenário, mutação de NFTs, falhas injetadas, atraso de liquidação de pedidos,
queda de sockets e eventos duplicados/antigos. Os testes de tempo real passam pelo `socket.io-client`
e os de REST pelos handlers MSW.

## Performance

`bun run build && bun run lighthouse` audita início (`/`) e detalhe (`/nft/nft-042-0`) nos perfis
mobile e desktop, 3 medições cada, com a configuração versionada em `lighthouse/config.json`.
Relatórios HTML/JSON e resumo de medianas em `lighthouse/reports/`. Resultados e análise em
[`docs/PERFORMANCE.md`](docs/PERFORMANCE.md).

## Deploy

Alvo: Vercel (preset Vite, comando `bun run build`, saída `dist/`). Os mocks ficam ativos no build
publicado (`VITE_ENABLE_MOCKS=true` no `.env` versionado), incluindo o tempo real.

URL pública: (a definir no deploy)

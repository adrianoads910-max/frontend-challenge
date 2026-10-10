# Performance e Lighthouse

## Como reproduzir

```bash
bun run build
CHROME_PATH=/usr/bin/google-chrome bun run lighthouse   # ou deixe o chrome-launcher detectar o Chrome
```

- Configuração versionada: [`lighthouse/config.json`](../lighthouse/config.json) (páginas, perfis, número de execuções, metas, flags do Chrome).
- Script: [`scripts/lighthouse.ts`](../scripts/lighthouse.ts) — cada execução usa um Chrome novo (perfil limpo, sem cache e sem Service Worker registrado), contra o **build otimizado** servido pelo `vite preview`, com o **cenário padrão** dos mocks.
- Relatórios: `lighthouse/reports/<página>-<perfil>-<execução>.{html,json}` e o resumo `lighthouse/reports/summary.{md,json}` (medianas, versões e ambiente).
- `LH_RUNS=1` e `LH_ONLY=inicio:mobile` permitem experimentos rápidos; os números abaixo usam a configuração completa (3 execuções).

## Ambiente

| Item | Valor |
|---|---|
| Lighthouse | 13.5.0 (API Node) |
| Chrome | 148 (headless new) |
| Bun / Node | 1.3.13 / 24.3 |
| Máquina | Linux x64, Intel i5-12450H |
| Condições | `vite preview` (build de produção), cenário `default` dos mocks, throttling padrão do Lighthouse — mobile: 4G lento simulado + CPU 4×; desktop: preset desktop |

## Resultados (mediana de 3 execuções)

| Página | Perfil | Performance | Accessibility | Best Practices | SEO | LCP | FCP | CLS | TBT |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|
| Início (`/`) | mobile | **93** | **100** | **100** | **100** | 2,85 s | 1,70 s | 0 | 153 ms |
| Início (`/`) | desktop | **99** | **100** | **100** | **100** | 0,74 s | 0,55 s | 0,003 | 0 ms |
| Detalhe (`/nft/nft-042-0`) | mobile | **95** | **100** | **100** | **100** | 2,72 s | 1,71 s | 0 | 78 ms |
| Detalhe (`/nft/nft-042-0`) | desktop | **100** | **100** | **100** | **100** | 0,76 s | 0,54 s | 0 | 0 ms |

Metas do desafio: Performance ≥ 90, Accessibility ≥ 95, Best Practices ≥ 95, SEO ≥ 90 — **todas atingidas** nas quatro combinações. A auditoria carrega as imagens reais, a fonte Roboto Mono, o backend simulado (MSW + Socket.IO) e todas as funcionalidades; não há nenhum caminho exclusivo para a auditoria.

## O que determina o LCP no mobile

No mobile o elemento de LCP é a **arte do 2º card do catálogo** (162 × 162 px), maior que a arte do hero no layout mobile do Figma. Ela depende de uma cadeia inteira: JS da aplicação → JS do MSW → registro do Service Worker → resposta simulada de `GET /api/nfts` → download da imagem. Por isso o LCP mobile (~2,8 s) é bem maior que o desktop (~0,75 s, em que o LCP é o hero, estático e pré-carregado). O custo do backend simulado é real e foi mantido: a versão publicada precisa dos mocks ativos.

## Experimentos (medidos, não presumidos)

| # | Mudança | Resultado (início, mobile) | Decisão |
|---|---|---|---|
| 0 | Linha de base: mocks iniciam, depois o app é carregado e renderizado | Perf 90, LCP 3,34 s, CLS do detalhe desktop 0,185, SEO 92, A11y 97 | — |
| 1 | `robots.txt` | SEO 92 → 100 | mantido |
| 2 | Área de toque de 24 px nos pontos do carrossel (`target-size`) | A11y 97 → 100 | mantido |
| 3 | `min-height: 100dvh` no `<main>` (o rodapé começa abaixo da dobra e não é empurrado quando os dados chegam) | CLS detalhe desktop 0,185 → 0 | mantido |
| 4 | Renderizar o app **antes** dos mocks, baixando app e MSW **em paralelo** | Perf 90 → **78**, LCP 3,3 → 4,5 s | **revertido** |
| 5 | MSW como segundo entry no HTML (`modulepreload` de tudo) | Perf **69**, FCP 3,8 s | **revertido** |
| 6 | A/B com 3 execuções: boot sequencial × paralelo | 89 × 78 | sequencial mantido |
| 7 | *Shim* de `tldts` (lista de sufixos públicos usada pelo cookie store do MSW; o app não usa cookies) | chunk do MSW 467 → 204 KB (173 → 61 KB gzip); Perf 89 → **94**, LCP 3,4 → 2,9 s | mantido |
| 8 | Latência padrão dos mocks de 120–450 ms para 60–180 ms (o cenário "Rede lenta" cobre o caso pessimista) | ganho pequeno no LCP dependente de dados | mantido |

Por que o paralelo foi pior (exp. 4–6): com 4G lento, baixar app e MSW ao mesmo tempo **divide a banda** — os dois terminam tarde — e o registro do Service Worker só começa quando o MSW chega. Na ordem sequencial, o MSW chega cedo com a banda toda e o **registro do Service Worker acontece enquanto o app baixa**. A ordem final está documentada em `src/main.tsx`.

## Outras otimizações presentes

- Artes dos NFTs convertidas de PNG (~2 MB cada) para **WebP 256/512/1024** (6–73 KB) com `srcset`/`sizes`; as 3 primeiras do grid com `fetchpriority="high"` e `loading="eager"`, as demais `lazy`; hero pré-carregado no `index.html`.
- Code splitting automático por rota (TanStack Router `autoCodeSplitting`); `socket.io-client` carregado sob demanda.
- Imagens com `width`/`height` e skeletons com as mesmas dimensões do conteúdo (CLS 0 nas medições mobile).
- `vercel.json`: assets com hash servidos com `Cache-Control: immutable` (não afeta o Lighthouse de primeira visita, mas sim navegações seguintes).

## Limitações e próximos passos

- O LCP mobile continua acima de 2,5 s (limiar "bom" do Core Web Vitals) por causa da cadeia de dados descrita acima. Em produção, com uma API real, o MSW sairia do caminho crítico (~61 KB gzip e o registro do Service Worker); renderização no servidor ou dados iniciais embutidos no HTML reduziriam ainda mais.
- `react-dom` e `@base-ui/react` dominam o bundle do app; trocar componentes por versões mais leves não compensaria o custo em acessibilidade.
- As medições são de laboratório (simuladas) numa única máquina; a variação entre execuções foi de ±2–3 pontos, por isso as decisões usam a mediana de 3 execuções.

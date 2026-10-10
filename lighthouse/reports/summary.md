# Lighthouse — mediana de 3 execuções

- **date**: 2026-10-10T23:51:24.716Z
- **lighthouse**: 13.5.0
- **chrome**: Chrome/148.0.0.0
- **node**: v24.3.0
- **bun**: 1.3.13
- **os**: Linux 7.0.0-38-generic (x64)
- **cpu**: 12th Gen Intel(R) Core(TM) i5-12450H
- **runsPerPage**: 3
- **conditions**: vite preview (optimized build), default mock scenario, fresh Chrome profile per run, Lighthouse default throttling (mobile: simulated slow 4G + 4x CPU; desktop: desktop preset)

| Página | Perfil | performance | accessibility | best-practices | seo | LCP | FCP | CLS | TBT |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|
| inicio | mobile | 93 | 100 | 100 | 100 | 2.85 s | 1.70 s | 0 | 153 ms |
| inicio | desktop | 99 | 100 | 100 | 100 | 0.74 s | 0.55 s | 0.003 | 0 ms |
| detalhe | mobile | 95 | 100 | 100 | 100 | 2.72 s | 1.71 s | 0 | 78 ms |
| detalhe | desktop | 100 | 100 | 100 | 100 | 0.76 s | 0.54 s | 0 | 0 ms |

Metas: performance ≥ 90, accessibility ≥ 95, best-practices ≥ 95, seo ≥ 90.

import { mulberry32 } from "./fixtures";

/*
 * Network conditions & failure scenarios. A scenario is selected with `?scenario=<id>` (persisted
 * in localStorage) or from the mock control panel / `POST /__mock/scenario`. Everything is
 * deterministic: latencies come from a seeded PRNG and failures from request counters, so the same
 * scenario always produces the same sequence — Playwright relies on that.
 */

export const SCENARIOS = {
  default: { label: "Padrão", description: "Latência realista (120–450 ms), tudo funcionando." },
  slow: { label: "Rede lenta", description: "Todas as respostas levam 1,5–3 s (skeletons, feedback de carregamento)." },
  "out-of-order": {
    label: "Respostas fora de ordem",
    description: "Consultas ao catálogo alternam 1,8 s e 0,2 s: uma busca antiga chega depois da nova.",
  },
  offline: { label: "Sem conexão", description: "Toda chamada à API falha com erro de rede." },
  flaky: { label: "Instável (503)", description: "A cada 3 requisições à API, uma responde 503 TRANSIENT." },
  "server-error": { label: "Erro no catálogo (500)", description: "GET /api/nfts responde 500 INTERNAL." },
  empty: { label: "Catálogo vazio", description: "A listagem não retorna resultados." },
  "session-short": { label: "Sessão curta", description: "Novas sessões expiram em 20 s (expiração durante navegação/checkout)." },
  "price-change": {
    label: "Preço muda no checkout",
    description: "1,5 s após gerar a cotação, o preço do primeiro item sobe 0.10 ETH (evento nft.updated).",
  },
  "sold-out": { label: "Edição esgota no checkout", description: "1,5 s após gerar a cotação, a edição do primeiro item esgota." },
  "payment-declined": { label: "Pagamento recusado", description: "Pedidos ficam pendentes e então são recusados." },
  "order-timeout": {
    label: "Timeout ao criar pedido",
    description: "O pedido é criado, mas a primeira resposta demora 12 s (o cliente expira em 8 s e reenvia com a mesma chave).",
  },
  "wallet-rejected": { label: "Carteira recusa conexão", description: "A conexão da carteira no checkout é recusada." },
} as const;

export type ScenarioId = keyof typeof SCENARIOS;
export const SCENARIO_IDS = Object.keys(SCENARIOS) as ScenarioId[];

const STORAGE_KEY = "kurio.mock.scenario";

export function isScenario(value: unknown): value is ScenarioId {
  return typeof value === "string" && value in SCENARIOS;
}

export class ScenarioState {
  current: ScenarioId = "default";
  private rand = mulberry32(1);
  private apiCalls = 0;
  private catalogCalls = 0;
  /** Idempotency keys whose first POST /api/orders already got the slow (timed-out) response. */
  readonly timedOutKeys = new Set<string>();

  load(): ScenarioId {
    const fromUrl = new URLSearchParams(location.search).get("scenario");
    const stored = localStorage.getItem(STORAGE_KEY);
    this.set(isScenario(fromUrl) ? fromUrl : isScenario(stored) ? stored : "default");
    return this.current;
  }

  set(id: ScenarioId): void {
    this.current = id;
    localStorage.setItem(STORAGE_KEY, id);
    // Re-seed so a scenario always replays the same sequence from the moment it is selected.
    this.rand = mulberry32(id.length * 7919 + 17);
    this.apiCalls = 0;
    this.catalogCalls = 0;
    this.timedOutKeys.clear();
  }

  /** Latency for the next API request, in ms. */
  latency(isCatalog: boolean): number {
    if (this.current === "slow") return 1500 + Math.floor(this.rand() * 1500);
    if (this.current === "out-of-order" && isCatalog) return this.catalogCalls++ % 2 === 0 ? 1800 : 200;
    return 120 + Math.floor(this.rand() * 330);
  }

  /** Deterministic transient failure: every 3rd API call in the "flaky" scenario. */
  shouldFailTransiently(): boolean {
    this.apiCalls += 1;
    return this.current === "flaky" && this.apiCalls % 3 === 0;
  }
}

export const scenario = new ScenarioState();

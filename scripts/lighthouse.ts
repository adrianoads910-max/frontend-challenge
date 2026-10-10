/**
 * Lighthouse audit: every page × profile × run in a fresh Chrome (clean profile, no cache, no
 * Service Worker), against the optimized build with the default mock scenario.
 *   bun run build && bun run lighthouse
 * Reports: lighthouse/reports/<page>-<profile>-<run>.{html,json}; summary (medians):
 * lighthouse/reports/summary.{json,md}
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import os from "node:os";
import { spawn } from "node:child_process";
import * as chromeLauncher from "chrome-launcher";
import lighthouse, { desktopConfig } from "lighthouse";

interface Config {
  baseUrl: string;
  pages: Array<{ name: string; path: string }>;
  profiles: Array<"mobile" | "desktop">;
  runs: number;
  categories: string[];
  targets: Record<string, number>;
  chromeFlags: string[];
}

const config = JSON.parse(readFileSync("lighthouse/config.json", "utf8")) as Config;
if (process.env.LH_RUNS) config.runs = Number(process.env.LH_RUNS);
// Optional filters for quick experiments, e.g. LH_ONLY=inicio:mobile
if (process.env.LH_ONLY) {
  const [page, profile] = process.env.LH_ONLY.split(":");
  config.pages = config.pages.filter((p) => p.name === page);
  if (profile) config.profiles = config.profiles.filter((p) => p === profile);
}
const outDir = "lighthouse/reports";
mkdirSync(outDir, { recursive: true });

async function serverUp(url: string) {
  try {
    return (await fetch(url)).ok;
  } catch {
    return false;
  }
}

let preview: ReturnType<typeof spawn> | null = null;
if (!(await serverUp(config.baseUrl))) {
  preview = spawn("bunx", ["vite", "preview", "--port", new URL(config.baseUrl).port, "--strictPort"], { stdio: "ignore" });
  for (let i = 0; i < 60 && !(await serverUp(config.baseUrl)); i++) await new Promise((r) => setTimeout(r, 500));
}

const median = (values: number[]) => {
  const s = [...values].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)]!;
};

type Row = { page: string; profile: string; run: number; scores: Record<string, number>; lcp: number; cls: number; tbt: number; fcp: number };
const rows: Row[] = [];
let lighthouseVersion = "";
let chromeVersion = "";

for (const page of config.pages) {
  for (const profile of config.profiles) {
    for (let run = 1; run <= config.runs; run++) {
      const chrome = await chromeLauncher.launch({ chromeFlags: config.chromeFlags, chromePath: process.env.CHROME_PATH });
      try {
        const result = await lighthouse(
          `${config.baseUrl}${page.path}`,
          { port: chrome.port, output: ["html", "json"], onlyCategories: config.categories, logLevel: "error" },
          profile === "desktop" ? desktopConfig : undefined,
        );
        if (!result) throw new Error("no result");
        const lhr = result.lhr;
        lighthouseVersion = lhr.lighthouseVersion;
        chromeVersion = lhr.environment.hostUserAgent.match(/Chrome\/[\d.]+/)?.[0] ?? "";
        const [html, json] = result.report as string[];
        const base = `${outDir}/${page.name}-${profile}-${run}`;
        writeFileSync(`${base}.html`, html!);
        writeFileSync(`${base}.json`, json!);
        const audit = (id: string) => lhr.audits[id]?.numericValue ?? NaN;
        const row: Row = {
          page: page.name,
          profile,
          run,
          scores: Object.fromEntries(config.categories.map((c) => [c, Math.round((lhr.categories[c]?.score ?? 0) * 100)])),
          lcp: audit("largest-contentful-paint"),
          cls: audit("cumulative-layout-shift"),
          tbt: audit("total-blocking-time"),
          fcp: audit("first-contentful-paint"),
        };
        rows.push(row);
        console.log(`${page.name} ${profile} #${run}:`, row.scores, `LCP ${Math.round(row.lcp)}ms CLS ${row.cls.toFixed(3)} TBT ${Math.round(row.tbt)}ms`);
      } finally {
        await chrome.kill();
      }
    }
  }
}

const summary = config.pages.flatMap((page) =>
  config.profiles.map((profile) => {
    const r = rows.filter((x) => x.page === page.name && x.profile === profile);
    return {
      page: page.name,
      profile,
      median: Object.fromEntries(config.categories.map((c) => [c, median(r.map((x) => x.scores[c]!))])),
      lcpMs: Math.round(median(r.map((x) => x.lcp))),
      fcpMs: Math.round(median(r.map((x) => x.fcp))),
      cls: Number(median(r.map((x) => x.cls)).toFixed(3)),
      tbtMs: Math.round(median(r.map((x) => x.tbt))),
    };
  }),
);

const environment = {
  date: new Date().toISOString(),
  lighthouse: lighthouseVersion,
  chrome: chromeVersion,
  node: process.version,
  bun: process.versions.bun,
  os: `${os.type()} ${os.release()} (${os.arch()})`,
  cpu: os.cpus()[0]?.model,
  runsPerPage: config.runs,
  conditions: "vite preview (optimized build), default mock scenario, fresh Chrome profile per run, Lighthouse default throttling (mobile: simulated slow 4G + 4x CPU; desktop: desktop preset)",
};
writeFileSync(`${outDir}/summary.json`, JSON.stringify({ environment, summary, runs: rows }, null, 2));

const cats = config.categories;
const md = [
  "# Lighthouse — mediana de " + config.runs + " execuções",
  "",
  ...Object.entries(environment).map(([k, v]) => `- **${k}**: ${v}`),
  "",
  `| Página | Perfil | ${cats.join(" | ")} | LCP | FCP | CLS | TBT |`,
  `|---|---|${cats.map(() => "---:").join("|")}|---:|---:|---:|---:|`,
  ...summary.map(
    (s) =>
      `| ${s.page} | ${s.profile} | ${cats.map((c) => `${s.median[c]}${s.median[c]! < config.targets[c]! ? " ⚠️" : ""}`).join(" | ")} | ${(s.lcpMs / 1000).toFixed(2)} s | ${(s.fcpMs / 1000).toFixed(2)} s | ${s.cls} | ${s.tbtMs} ms |`,
  ),
  "",
  `Metas: ${cats.map((c) => `${c} ≥ ${config.targets[c]}`).join(", ")}.`,
].join("\n");
writeFileSync(`${outDir}/summary.md`, md + "\n");
console.log("\n" + md);
preview?.kill();

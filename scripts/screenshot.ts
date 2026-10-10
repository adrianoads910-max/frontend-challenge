/**
 * Dev utility: screenshots a route at desktop/mobile widths and prints console errors.
 *   bun scripts/screenshot.ts /carrinho out.png [width] [--full]
 */
import { chromium } from "@playwright/test";

const [path = "/", out = "shot.png", width = "1440", ...flags] = process.argv.slice(2);
const base = process.env.BASE_URL ?? "http://localhost:5173";
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: Number(width), height: Number(width) > 600 ? 1000 : 896 } });
page.on("console", (m) => {
  if (m.type() === "error" || m.type() === "warning") console.log(`[${m.type()}]`, m.text().slice(0, 300));
});
page.on("pageerror", (e) => console.log("[pageerror]", e.message));
await page.goto(base + path, { waitUntil: "networkidle" });
await page.waitForTimeout(Number(process.env.WAIT ?? 1500));
await page.screenshot({ path: out, fullPage: flags.includes("--full") });
await browser.close();

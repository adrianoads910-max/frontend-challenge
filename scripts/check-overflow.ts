/** Dev utility: reports elements wider than the viewport (horizontal overflow) on a route. */
import { chromium } from "@playwright/test";
const [path = "/", ...widths] = process.argv.slice(2);
const browser = await chromium.launch();
for (const w of widths.length ? widths.map(Number) : [390, 768, 1440]) {
  const page = await browser.newPage({ viewport: { width: w, height: 900 } });
  await page.goto((process.env.BASE_URL ?? "http://localhost:5173") + path, { waitUntil: "networkidle" });
  await page.waitForTimeout(1200);
  const offenders = await page.evaluate(() => {
    const vw = document.documentElement.clientWidth;
    return [...document.querySelectorAll("body *")]
      .filter((el) => el.getBoundingClientRect().right > vw + 1 && getComputedStyle(el).position !== "fixed")
      .slice(0, 8)
      .map((el) => `${el.tagName.toLowerCase()}.${String(el.className).slice(0, 60)} → ${Math.round(el.getBoundingClientRect().right)}px`);
  });
  console.log(`${w}px: ${offenders.length ? offenders.join("\n   ") : "ok"}`);
  await page.close();
}
await browser.close();

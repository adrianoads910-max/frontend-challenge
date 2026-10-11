import { expect, test } from "@playwright/test";
import { addToCart, login, open } from "./support";

/*
 * Section 8: every screen at 390 / 768 / 1440 px without horizontal overflow, and still usable
 * at 200% zoom (simulated as a 640 px viewport, the CSS width of 1280 px at 200%).
 */
const WIDTHS = [390, 768, 1440, 640];

async function overflow(page: import("@playwright/test").Page) {
  return page.evaluate(() => {
    const vw = document.documentElement.clientWidth;
    // Elements inside an intentional scroll container (e.g. the gallery strip) do not overflow
    // the page.
    const inScroller = (el: Element) => {
      for (let p = el.parentElement; p; p = p.parentElement) {
        if (["auto", "scroll", "hidden"].includes(getComputedStyle(p).overflowX)) return p !== document.body && p !== document.documentElement;
      }
      return false;
    };
    const offenders = [...document.querySelectorAll("body *")].filter((el) => {
      const r = el.getBoundingClientRect();
      return r.width > 0 && r.right > vw + 1 && getComputedStyle(el).position !== "fixed" && !inScroller(el);
    });
    return {
      scroll: document.documentElement.scrollWidth - vw,
      offenders: offenders.slice(0, 5).map((el) => `${el.tagName.toLowerCase()}.${String(el.className).slice(0, 50)}`),
    };
  });
}

test.describe("responsividade: sem overflow horizontal", () => {
  test.skip(({ isMobile }) => isMobile, "viewport is driven explicitly");

  const pages: Array<{ name: string; path: string; auth?: boolean; cart?: boolean }> = [
    { name: "início", path: "/" },
    { name: "detalhe", path: "/nft/nft-042-0" },
    { name: "carrinho", path: "/carrinho", cart: true },
    { name: "login", path: "/entrar" },
    { name: "cadastro", path: "/cadastro" },
    { name: "pagamento", path: "/pagamento", auth: true, cart: true },
    { name: "perfil", path: "/perfil", auth: true },
    { name: "carteiras", path: "/carteiras", auth: true },
    { name: "favoritos", path: "/favoritos", auth: true },
  ];

  for (const p of pages) {
    test(p.name, async ({ page }) => {
      if (p.auth) await login(page, "ana");
      if (p.cart) await addToCart(page, "nft-042-0", 1);
      for (const width of WIDTHS) {
        await page.setViewportSize({ width, height: 900 });
        await open(page, p.path);
        await page.waitForLoadState("networkidle");
        const result = await overflow(page);
        expect(result, `${p.name} @ ${width}px`).toEqual({ scroll: 0, offenders: [] });
      }
    });
  }
});

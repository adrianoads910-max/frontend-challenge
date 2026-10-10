import { expect, type Page, test } from "@playwright/test";
import { addToCart, login, open } from "./support";

/*
 * Visual regression of the four pages required by the challenge, on desktop (1440) and mobile
 * (390). Data is deterministic (seeded fixtures, fresh context per test). Baselines live in
 * e2e/__screenshots__ and are updated with `bun run test:visual:update`.
 */

async function settle(page: Page) {
  // Transient UI (toasts) and the demo control panel are not part of the baseline.
  await page.addStyleTag({ content: "[data-sonner-toaster],[data-visual-ignore]{display:none!important}" });
  await page.evaluate(() => document.fonts.ready);
  // Scroll through the page so lazy images load (a full-page shot would show them blank).
  await page.evaluate(async () => {
    for (let y = 0; y < document.body.scrollHeight; y += window.innerHeight / 2) {
      window.scrollTo(0, y);
      await new Promise((r) => setTimeout(r, 60));
    }
    window.scrollTo(0, 0);
  });
  await page.waitForLoadState("networkidle");
  // Wait until every <img> in the document finished decoding.
  // (images inside display:none sections — e.g. desktop-only blocks on mobile — never load).
  await page.waitForFunction(() => [...document.images].filter((img) => img.getClientRects().length > 0).every((img) => img.complete));
  await page.mouse.move(0, 0);
}

const options = (page: Page) => ({
  fullPage: true,
  mask: [page.locator("[data-visual-ignore]"), page.locator("[data-sonner-toaster]")],
});

test.describe("regressão visual", () => {
  test("início", async ({ page }) => {
    await open(page, "/");
    await expect(page.getByRole("list", { name: "Resultados" }).locator("article")).toHaveCount(9);
    await settle(page);
    await expect(page).toHaveScreenshot("inicio.png", options(page));
  });

  test("detalhe do NFT", async ({ page }) => {
    await open(page, "/nft/nft-042-0");
    await expect(page.getByRole("heading", { name: "Emerald Ape #042", level: 1 })).toBeVisible();
    await settle(page);
    await expect(page).toHaveScreenshot("detalhe.png", options(page));
  });

  test("carrinho", async ({ page }) => {
    await addToCart(page, "nft-042-0", 2);
    await addToCart(page, "nft-314-4", 1);
    await addToCart(page, "nft-088-5", 1);
    await expect(page.getByRole("button", { name: "Conectar e finalizar" })).toBeEnabled();
    await settle(page);
    await expect(page).toHaveScreenshot("carrinho.png", options(page));
  });

  test("pagamento", async ({ page }) => {
    await login(page, "ana");
    await addToCart(page, "nft-042-0", 2);
    await addToCart(page, "nft-314-4", 1);
    await page.getByRole("button", { name: "Conectar e finalizar" }).click();
    await expect(page.getByRole("button", { name: "Confirmar compra" })).toBeVisible();
    await settle(page);
    await expect(page).toHaveScreenshot("pagamento.png", options(page));
  });
});

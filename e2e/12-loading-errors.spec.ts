import { expect, test } from "@playwright/test";
import { mock, open, setScenario } from "./support";

test.describe("12. skeletons em carregamento lento, feedback de falha e recuperação", () => {
  test("rede lenta: skeletons com as dimensões do conteúdo e depois os dados", async ({ page }) => {
    await open(page, "/", "slow");
    const loading = page.getByLabel("Carregando NFTs");
    await expect(loading).toBeVisible();
    await expect(loading).toHaveAttribute("aria-busy", "true");
    await expect(page.getByRole("list", { name: "Resultados" }).locator("article")).toHaveCount(9, { timeout: 15_000 });
  });

  test("skeletons no detalhe e no resumo do carrinho", async ({ page }) => {
    await open(page, "/nft/nft-042-0", "slow");
    await expect(page.getByLabel("Carregando NFT")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Emerald Ape #042", level: 1 })).toBeVisible({ timeout: 15_000 });
    await open(page, "/carrinho");
    await expect(page.getByLabel("Carregando carrinho")).toBeVisible();
  });

  test("erro 500 no catálogo: mensagem, nova tentativa e recuperação", async ({ page }) => {
    await open(page, "/", "server-error");
    await expect(page.getByText("Não foi possível carregar os NFTs.")).toBeVisible({ timeout: 15_000 });
    await setScenario(page, "default");
    await page.getByRole("button", { name: "Tentar novamente" }).click();
    await expect(page.getByRole("list", { name: "Resultados" }).locator("article")).toHaveCount(9);
  });

  test("sem conexão: feedback específico e recuperação quando a rede volta", async ({ page }) => {
    await open(page, "/", "offline");
    await expect(page.getByText("Sem conexão com o servidor.").first()).toBeVisible({ timeout: 20_000 });
    await setScenario(page, "default");
    await page.getByRole("button", { name: "Tentar novamente" }).click();
    await expect(page.getByRole("list", { name: "Resultados" }).locator("article")).toHaveCount(9);
  });

  test("falhas transitórias (503) são repetidas automaticamente sem intervenção", async ({ page }) => {
    await open(page, "/nft/nft-009-1");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await mock(page, "fail-next", { pattern: "^/api/nfts/nft-207-6$", status: 503, code: "TRANSIENT", count: 2 });
    await open(page, "/nft/nft-207-6");
    await expect(page.getByRole("heading", { name: "Golden Beat #207", level: 1 })).toBeVisible({ timeout: 15_000 });
  });
});

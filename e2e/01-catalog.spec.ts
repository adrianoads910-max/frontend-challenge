import { expect, test } from "@playwright/test";
import { open } from "./support";

const grid = (page: import("@playwright/test").Page) => page.getByRole("list", { name: "Resultados" });
const names = async (page: import("@playwright/test").Page) =>
  grid(page).locator("article h3").allInnerTexts();

test.describe("1. catálogo: busca, filtros, ordenação, paginação e histórico", () => {
  test("filtros combinados e ordenação compõem a URL, reiniciam a paginação e sobrevivem a refresh", async ({ page, isMobile }) => {
    await open(page, "/");
    await expect(grid(page).locator("article")).toHaveCount(9);

    // Page 2 first, so we can check that a filter change resets pagination.
    await page.getByRole("button", { name: "Página 2" }).click();
    await expect(page).toHaveURL(/page=2/);

    if (isMobile) await page.getByRole("button", { name: /Abrir filtros/ }).click();
    const filters = isMobile ? page.getByRole("dialog", { name: "Filtros" }) : page.getByRole("complementary", { name: "Filtros" });
    await filters.getByLabel(/^Música/).check();
    await expect(page).not.toHaveURL(/page=2/);
    await filters.getByLabel(/^Polygon/).check();
    if (isMobile) await page.keyboard.press("Escape");

    await expect(page).toHaveURL(/categories=.*music/);
    await expect(page).toHaveURL(/networks=.*polygon/);
    await expect(grid(page).locator("article").first()).toBeVisible();
    // Golden Beat #207 is the only music + polygon NFT in the fixtures.
    await expect(page.getByText("1 resultado(s)")).toBeVisible();
    await expect(grid(page).getByText("Golden Beat #207")).toBeVisible();

    await page.getByLabel("Ordenar por").selectOption("price-desc");
    await expect(page).toHaveURL(/sort=price-desc/);
    await expect(grid(page)).not.toHaveAttribute("aria-busy", "true");
    const before = await names(page);

    await page.reload();
    await expect(page).toHaveURL(/sort=price-desc/);
    await expect.poll(() => names(page)).toEqual(before);
  });

  test("busca pelo nome, resultado vazio e restauração pelo histórico (voltar/avançar)", async ({ page, isMobile }) => {
    await open(page, "/");
    const search = async (term: string) => {
      if (isMobile) {
        await page.getByPlaceholder("Explorar coleções").fill(term);
        await page.keyboard.press("Enter");
      } else {
        await page.getByRole("button", { name: "Buscar NFTs" }).click();
        await page.getByLabel("Nome do NFT").fill(term);
        await page.getByRole("button", { name: "Buscar", exact: true }).click();
      }
    };

    await search("Nomad");
    await expect(page).toHaveURL(/q=Nomad/);
    await expect.poll(() => names(page)).toEqual(expect.arrayContaining(["Sage Nomad #009", "Violet Nomad #314"]));

    await search("inexistente-xyz");
    await expect(page.getByText("Nenhum NFT encontrado.")).toBeVisible();

    await page.goBack();
    await expect(page).toHaveURL(/q=Nomad/);
    await expect(grid(page).getByText("Sage Nomad #009")).toBeVisible();
    await page.goForward();
    await expect(page.getByText("Nenhum NFT encontrado.")).toBeVisible();
  });

  test("paginação navega e o botão voltar restaura a página anterior", async ({ page }) => {
    await open(page, "/");
    await expect(grid(page).locator("article")).toHaveCount(9);
    const first = await names(page);
    await page.getByRole("button", { name: "Próxima página" }).click();
    await expect(page).toHaveURL(/page=2/);
    await expect.poll(() => names(page)).not.toEqual(first);
    await expect(page.getByRole("button", { name: "Página 2" })).toHaveAttribute("aria-current", "page");
    await page.goBack();
    await expect(page).not.toHaveURL(/page=/);
    await expect.poll(() => names(page)).toEqual(first);
  });

  test("respostas fora de ordem: a resposta lenta de uma busca antiga não sobrescreve a nova", async ({ page }) => {
    await open(page, "/", "out-of-order");
    await expect(grid(page).locator("article").first()).toBeVisible({ timeout: 15_000 });
    // In this scenario catalog calls alternate 1.8 s / 0.2 s: the first click is slow, the second fast.
    await page.getByRole("button", { name: "Página 2" }).click();
    await page.getByRole("button", { name: "Página 3" }).click();
    await expect(page).toHaveURL(/page=3/);
    await expect(page.getByRole("button", { name: "Página 3" })).toHaveAttribute("aria-current", "page");
    const page3 = await names(page);
    await page.waitForTimeout(2_200); // let the stale page-2 response arrive
    await expect.poll(() => names(page)).toEqual(page3);
  });
});

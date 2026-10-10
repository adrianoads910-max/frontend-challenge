import { expect, test } from "@playwright/test";
import { mock, open } from "./support";

test.describe("2. detalhe: acesso direto e recurso inexistente", () => {
  test("acesso direto a um NFT carrega o detalhe com edições e limites", async ({ page }) => {
    await open(page, "/nft/nft-552-2");
    await expect(page.getByRole("heading", { name: "Neon Vessel #552", level: 1 })).toBeVisible();
    await expect(page).toHaveTitle(/Neon Vessel #552/);
    // Fixture: the 1/10 edition of this NFT is sold out.
    await expect(page.getByRole("radio", { name: /1\/10/ })).toBeDisabled();
    await expect(page.getByRole("radio", { name: "1/50" })).toBeChecked();
    await expect(page.getByText(/máximo de 10 por pedido/)).toBeVisible();
  });

  test("NFT inexistente mostra 404 e permite voltar ao início", async ({ page }) => {
    await open(page, "/nft/nao-existe");
    await expect(page.getByRole("heading", { name: "NFT não encontrado" })).toBeVisible();
    await page.getByRole("link", { name: "Voltar ao início" }).click();
    await expect(page).toHaveURL(/\/$/);
  });

  test("rota inexistente mostra a página 404", async ({ page }) => {
    await open(page, "/qualquer/coisa");
    await expect(page.getByRole("heading", { name: "Página não encontrada" })).toBeVisible();
  });

  test("limite de quantidade: o botão de aumentar trava no estoque disponível", async ({ page, isMobile }) => {
    // Fixture index 4 (Violet Nomad #314) has only 2 units of the 1/50 edition.
    await open(page, "/nft/nft-314-4");
    await expect(page.getByText(/Restam 2/)).toBeVisible();
    const increase = page.getByRole("button", { name: "Aumentar quantidade" }).locator("visible=true").first();
    await increase.click();
    await expect(increase).toBeDisabled();
    if (!isMobile) await expect(page.getByText("Limite atingido")).toBeVisible();
  });

  test("edição esgotada: compra indisponível quando todas as edições acabam", async ({ page }) => {
    await open(page, "/nft/nft-042-0");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    for (const ed of ["e10", "e50", "open"]) await mock(page, "nfts/nft-042-0/mutate", { editionId: `nft-042-0-${ed}`, available: 0 });
    await page.reload();
    await expect(page.getByText("Este NFT está esgotado em todas as edições.")).toBeVisible();
    await expect(page.getByRole("button", { name: /ESGOTADO|Esgotado/ }).locator("visible=true").first()).toBeDisabled();
  });
});

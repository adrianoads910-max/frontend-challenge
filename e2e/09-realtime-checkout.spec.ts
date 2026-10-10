import { expect, test } from "@playwright/test";
import { addToCart, login, mock, mockState, waitForSocket } from "./support";

test.describe("9. alteração de preço/disponibilidade via Socket.IO durante o checkout", () => {
  test("carrinho aberto: o evento atualiza o resumo e avisa a mudança de preço", async ({ page }) => {
    await addToCart(page, "nft-042-0", 1);
    await waitForSocket(page);
    const summary = page.getByRole("complementary", { name: /Resumo da carteira/ });
    await expect(summary.getByText("1.206 ETH")).toBeVisible();

    await mock(page, "nfts/nft-042-0/mutate", { editionId: "nft-042-0-e50", priceDelta: "0.10" });
    await expect(page.getByText(/Preço atualizado:/)).toBeVisible();
    await expect(page.getByText(/antes 1.19 ETH/).locator("visible=true").first()).toBeVisible();
    await expect(summary.getByText("1.306 ETH")).toBeVisible();
    await page.getByRole("button", { name: "Entendi" }).click();
    await expect(page.getByText(/Preço atualizado:/)).toHaveCount(0);
  });

  test("revisão aberta: a cotação desatualizada bloqueia a confirmação até ser renovada", async ({ page }) => {
    await login(page, "ana");
    await addToCart(page, "nft-042-0", 1);
    await page.getByRole("button", { name: "Conectar e finalizar" }).click();
    await page.getByRole("button", { name: "Conectar carteira" }).click();
    await expect(page.getByText(/Conectada na Ethereum/)).toBeVisible();
    await waitForSocket(page);
    await page.getByRole("button", { name: "Confirmar compra" }).click();
    const dialog = page.getByRole("dialog", { name: "Revise sua compra" });
    await expect(dialog.getByText("1.206 ETH")).toBeVisible();

    await mock(page, "nfts/nft-042-0/mutate", { editionId: "nft-042-0-e50", priceDelta: "0.10" });
    await expect(dialog.getByRole("alert")).toContainText("mudou enquanto você revisava");
    await expect(dialog.getByRole("button", { name: "Confirmar e pagar" })).toBeDisabled();

    await dialog.getByRole("button", { name: "Atualizar cotação" }).click();
    await expect(dialog.getByText("1.306 ETH", { exact: true })).toBeVisible();
    await expect(dialog.getByText(/O total mudou de 1.206 ETH para 1.306 ETH/)).toBeVisible();
    await dialog.getByRole("button", { name: "Confirmar e pagar" }).click();
    await expect(page.getByRole("heading", { name: "Seus NFTs agora estão na sua carteira" })).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole("cell", { name: "1.306 ETH" }).first()).toBeVisible();
  });

  test("preço muda entre a cotação e o envio: o servidor recusa (QUOTE_STALE) e exige nova confirmação", async ({ page }) => {
    await login(page, "ana");
    await addToCart(page, "nft-042-0", 1);
    await page.getByRole("button", { name: "Conectar e finalizar" }).click();
    await page.getByRole("button", { name: "Conectar carteira" }).click();
    await expect(page.getByText(/Conectada na Ethereum/)).toBeVisible();
    // Realtime outage: the client cannot learn about the change, the server must refuse the quote.
    await mock(page, "socket/block", { ms: 30_000 });
    await page.getByRole("button", { name: "Confirmar compra" }).click();
    const dialog = page.getByRole("dialog", { name: "Revise sua compra" });
    await expect(dialog).toBeVisible();
    await page.evaluate(() => fetch("/__mock/nfts/nft-042-0/mutate", { method: "POST", body: JSON.stringify({ editionId: "nft-042-0-e50", price: "1.50" }) }));
    await dialog.getByRole("button", { name: "Confirmar e pagar" }).click();
    await expect(dialog.getByText(/Os valores mudaram: o total passou de 1.206 ETH para 1.516 ETH/)).toBeVisible();
    expect((await mockState(page)).orders).toHaveLength(0);
    await dialog.getByRole("button", { name: "Confirmar e pagar" }).click();
    await expect(page).toHaveURL(/\/pedido\//);
  });

  test("edição esgota durante o checkout: a compra é impedida e o carrinho sinaliza", async ({ page }) => {
    await login(page, "ana");
    await addToCart(page, "nft-042-0", 1);
    await page.getByRole("button", { name: "Conectar e finalizar" }).click();
    await page.getByRole("button", { name: "Conectar carteira" }).click();
    await expect(page.getByText(/Conectada na Ethereum/)).toBeVisible();
    await page.getByRole("button", { name: "Confirmar compra" }).click();
    const dialog = page.getByRole("dialog", { name: "Revise sua compra" });
    await expect(dialog).toBeVisible();
    await mock(page, "nfts/nft-042-0/mutate", { editionId: "nft-042-0-e50", available: 0 });
    // Realtime flags the review as stale; refreshing the quote reports the sold-out edition.
    await expect(dialog.getByRole("button", { name: "Confirmar e pagar" })).toBeDisabled();
    await dialog.getByRole("button", { name: "Atualizar cotação" }).click();
    await expect(page).toHaveURL(/\/carrinho$/, { timeout: 10_000 });
    await expect(page.getByText(/Esgotado — remova para continuar/).locator("visible=true").first()).toBeVisible();
    await expect(page.getByRole("button", { name: "Conectar e finalizar" })).toBeDisabled();
  });
});

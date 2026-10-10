import { expect, test } from "@playwright/test";
import { addToCart, login, mock, mockState, open, waitForSocket } from "./support";

test.describe("6. compra completa", () => {
  test("do catálogo ao recibo confirmado, removendo do carrinho só o que foi comprado", async ({ page }) => {
    await login(page, "ana");

    // Catalog → detail
    await open(page, "/");
    await page.getByRole("link", { name: "Emerald Ape #042" }).click();
    await expect(page).toHaveURL(/\/nft\/nft-042-0$/);
    await expect(page.getByRole("heading", { name: "Emerald Ape #042", level: 1 })).toBeVisible();

    await addToCart(page, "nft-042-0", 2);
    await addToCart(page, "nft-314-4", 1);
    await expect(page.getByRole("button", { name: "Conectar e finalizar" })).toBeEnabled();

    await page.getByRole("button", { name: "Conectar e finalizar" }).click();
    await expect(page).toHaveURL(/\/pagamento$/);

    // Wallet connection (simulated) and review.
    await page.getByRole("button", { name: "Conectar carteira" }).click();
    await expect(page.getByText(/Conectada na Ethereum/)).toBeVisible();
    await waitForSocket(page);
    await page.getByRole("button", { name: "Confirmar compra" }).click();

    const review = page.getByRole("dialog", { name: "Revise sua compra" });
    await expect(review).toBeVisible();
    await expect(review.getByText("Emerald Ape #042")).toBeVisible();
    // 2 × 1.19 + 1.39 = 3.77; + 0.016 fee = 3.786
    await expect(review.getByText("3.786 ETH")).toBeVisible();
    await review.getByRole("button", { name: "Confirmar e pagar" }).click();

    // Pending → confirmed (driven by order.updated over Socket.IO).
    await expect(page).toHaveURL(/\/pedido\/order-/);
    await expect(page.getByRole("heading", { name: "Processando pagamento…" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Seus NFTs agora estão na sua carteira" })).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText("Transação confirmada na Ethereum")).toBeVisible();
    await expect(page.getByRole("cell", { name: /Emerald Ape #042/ })).toBeVisible();

    const state = await mockState(page);
    expect(state.orders).toHaveLength(1);
    expect(state.orders[0]!.status).toBe("confirmed");

    // Purchased items left the cart.
    await open(page, "/carrinho");
    await expect(page.getByText("Seu carrinho está vazio.")).toBeVisible();
  });

  test("recibo é um snapshot: mudanças posteriores no catálogo não o alteram", async ({ page }) => {
    await login(page, "ana");
    await addToCart(page, "nft-042-0", 1);
    await page.getByRole("button", { name: "Conectar e finalizar" }).click();
    await page.getByRole("button", { name: "Conectar carteira" }).click();
    await expect(page.getByText(/Conectada na Ethereum/)).toBeVisible();
    await page.getByRole("button", { name: "Confirmar compra" }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Confirmar e pagar" }).click();
    await expect(page.getByRole("heading", { name: "Seus NFTs agora estão na sua carteira" })).toBeVisible({ timeout: 15_000 });

    await mock(page, "nfts/nft-042-0/mutate", { price: "9.99" });
    await page.reload();
    await expect(page.getByRole("heading", { name: "Seus NFTs agora estão na sua carteira" })).toBeVisible();
    await expect(page.getByRole("cell", { name: "1.19 ETH" })).toBeVisible();
    await expect(page.getByText("9.99")).toHaveCount(0);
  });
});

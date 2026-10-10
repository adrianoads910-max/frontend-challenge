import { expect, type Page, test } from "@playwright/test";
import { addToCart, login, mockState, setScenario, waitForSocket } from "./support";

async function reachReview(page: Page) {
  await login(page, "ana");
  await addToCart(page, "nft-042-0", 1);
  await page.getByRole("button", { name: "Conectar e finalizar" }).click();
  await page.getByRole("button", { name: "Conectar carteira" }).click();
  await expect(page.getByText(/Conectada na Ethereum/)).toBeVisible();
  await waitForSocket(page);
  await page.getByRole("button", { name: "Confirmar compra" }).click();
  const dialog = page.getByRole("dialog", { name: "Revise sua compra" });
  await expect(dialog).toBeVisible();
  return dialog;
}

test.describe("7. falha de pagamento, clique repetido e timeout", () => {
  test("pagamento recusado: estado terminal, sem confirmação, itens preservados no carrinho", async ({ page }) => {
    const dialog = await reachReview(page);
    await setScenario(page, "payment-declined");
    await dialog.getByRole("button", { name: "Confirmar e pagar" }).click();
    await expect(page.getByRole("heading", { name: "Pagamento recusado" })).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole("heading", { name: "Seus NFTs agora estão na sua carteira" })).toHaveCount(0);
    await page.getByRole("link", { name: "Voltar ao carrinho" }).click();
    await expect(page.getByText("Emerald Ape #042").locator("visible=true").first()).toBeVisible();
    const state = await mockState(page);
    expect(state.orders.map((o) => o.status)).toEqual(["declined"]);
  });

  test("cliques repetidos em confirmar criam um único pedido", async ({ page }) => {
    const dialog = await reachReview(page);
    const confirm = dialog.getByRole("button", { name: "Confirmar e pagar" });
    // Rapid repeated clicks: only the first one may create an order.
    await confirm.dblclick();
    await confirm.click({ force: true, timeout: 500 }).catch(() => undefined);
    await expect(page).toHaveURL(/\/pedido\/order-/);
    await expect(page.getByRole("heading", { name: "Seus NFTs agora estão na sua carteira" })).toBeVisible({ timeout: 15_000 });
    expect((await mockState(page)).orders).toHaveLength(1);
  });

  test("timeout após criar o pedido: o reenvio com a mesma chave recupera o mesmo pedido", async ({ page }) => {
    test.setTimeout(60_000);
    const dialog = await reachReview(page);
    await setScenario(page, "order-timeout");
    await dialog.getByRole("button", { name: "Confirmar e pagar" }).click();
    await expect(dialog.getByRole("button", { name: "Enviando pedido…" })).toBeVisible();
    // First response takes 12 s; the client gives up at 8 s and retries with the same key.
    await expect(page).toHaveURL(/\/pedido\/order-/, { timeout: 30_000 });
    await expect(page.getByRole("heading", { name: "Seus NFTs agora estão na sua carteira" })).toBeVisible({ timeout: 15_000 });
    const state = await mockState(page);
    expect(state.orders).toHaveLength(1);
    expect(state.orders[0]!.status).toBe("confirmed");
  });

  test("carteira recusa a conexão: erro claro e nova tentativa", async ({ page }) => {
    await login(page, "ana");
    await addToCart(page, "nft-042-0", 1);
    await page.getByRole("button", { name: "Conectar e finalizar" }).click();
    await setScenario(page, "wallet-rejected");
    await page.getByRole("button", { name: "Conectar carteira" }).click();
    await expect(page.getByText(/A conexão foi recusada na carteira/)).toBeVisible();
    await page.getByRole("button", { name: "Confirmar compra" }).click();
    await expect(page.getByText("Conecte a carteira na rede selecionada antes de confirmar a compra.")).toBeVisible();
    await setScenario(page, "default");
    await page.getByRole("button", { name: "Tentar novamente" }).click();
    await expect(page.getByText(/Conectada na Ethereum/)).toBeVisible();
    await page.getByRole("button", { name: "Desconectar" }).click();
    await expect(page.getByText(/Carteira desconectada/)).toBeVisible();
  });
});

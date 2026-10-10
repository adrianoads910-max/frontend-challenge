import { expect, test } from "@playwright/test";
import { addToCart, login, mock, mockState, open, waitForSocket } from "./support";

test.describe("10. eventos duplicados/antigos, desconexão e retomada de pedido pendente", () => {
  test("evento duplicado é ignorado e evento antigo não regride o preço", async ({ page }) => {
    await open(page, "/nft/nft-042-0");
    await waitForSocket(page);
    await expect(page.getByText("1.19 ETH").first()).toBeVisible();

    await mock(page, "nfts/nft-042-0/mutate", { editionId: "nft-042-0-e50", priceDelta: "0.10" });
    await expect(page.getByText("Preço atualizado agora")).toBeVisible();
    await expect(page.getByText("1.29 ETH").first()).toBeVisible();

    await mock(page, "events/duplicate");
    await mock(page, "events/stale"); // version - 1 with price 999.99
    await page.waitForTimeout(800);
    await expect(page.getByText("999.99")).toHaveCount(0);
    await expect(page.getByText("1.29 ETH").first()).toBeVisible();
  });

  test("desconexão: avisa, reconecta sozinho e reconcilia com REST o que mudou offline", async ({ page }) => {
    await open(page, "/nft/nft-009-1");
    await waitForSocket(page);
    await expect(page.getByText("1.69 ETH").first()).toBeVisible();

    // Change happens while the socket is down → no event reaches the page.
    await page.evaluate(async () => {
      await fetch("/__mock/socket/disconnect", { method: "POST", body: "{}" });
      await fetch("/__mock/nfts/nft-009-1/mutate", { method: "POST", body: JSON.stringify({ editionId: "nft-009-1-e50", price: "2.00" }) });
    });
    await expect(page.getByRole("status").filter({ hasText: "Reconectando ao tempo real…" })).toBeVisible();
    // After reconnect the client refetches active resources from REST.
    await expect(page.getByText("2.00 ETH").first()).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole("status").filter({ hasText: "Reconectando" })).toHaveCount(0);
  });

  test("pedido pendente sobrevive a refresh/reconexão sem gerar outra compra e conclui por evento", async ({ page }) => {
    await login(page, "ana");
    await mock(page, "settle-delay", { ms: 600_000 }); // stays pending until settled explicitly
    await addToCart(page, "nft-042-0", 1);
    await page.getByRole("button", { name: "Conectar e finalizar" }).click();
    await page.getByRole("button", { name: "Conectar carteira" }).click();
    await expect(page.getByText(/Conectada na Ethereum/)).toBeVisible();
    await page.getByRole("button", { name: "Confirmar compra" }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Confirmar e pagar" }).click();
    await expect(page.getByRole("heading", { name: "Processando pagamento…" })).toBeVisible();
    const orderUrl = page.url();

    await page.reload();
    await expect(page.getByRole("heading", { name: "Processando pagamento…" })).toBeVisible();
    await mock(page, "socket/disconnect");

    // Trying to buy again is blocked while the order is pending.
    await open(page, "/pagamento");
    await expect(page.getByText("Você tem um pedido em processamento.")).toBeVisible();
    await expect(page.getByRole("button", { name: "Confirmar compra" })).toBeDisabled();
    await page.getByRole("link", { name: "Acompanhar pedido" }).click();
    await expect(page).toHaveURL(orderUrl);
    await waitForSocket(page);

    const state = await mockState(page);
    expect(state.orders).toHaveLength(1);
    await mock(page, `orders/${state.orders[0]!.id}/settle`, { outcome: "confirmed" });
    await expect(page.getByRole("heading", { name: "Seus NFTs agora estão na sua carteira" })).toBeVisible();
    // Terminal: replaying the event changes nothing.
    await mock(page, "events/duplicate");
    await expect(page.getByRole("heading", { name: "Seus NFTs agora estão na sua carteira" })).toBeVisible();
    expect((await mockState(page)).orders).toHaveLength(1);
  });

  test("eventos de pedido de outro usuário não chegam a esta sessão", async ({ page }) => {
    await login(page, "ana");
    await mock(page, "settle-delay", { ms: 600_000 });
    await addToCart(page, "nft-042-0", 1);
    await page.getByRole("button", { name: "Conectar e finalizar" }).click();
    await page.getByRole("button", { name: "Conectar carteira" }).click();
    await expect(page.getByText(/Conectada na Ethereum/)).toBeVisible();
    await page.getByRole("button", { name: "Confirmar compra" }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Confirmar e pagar" }).click();
    await expect(page.getByRole("heading", { name: "Processando pagamento…" })).toBeVisible();
    const orderId = (await mockState(page)).orders[0]!.id;

    // Switch to Bruno, then settle Ana's order: Bruno's session must not receive it.
    await open(page, "/perfil");
    await page.getByRole("button", { name: "Sair" }).click();
    await expect(page).toHaveURL(/\/$/);
    await login(page, "bruno");
    await waitForSocket(page);
    await mock(page, `orders/${orderId}/settle`, { outcome: "confirmed" });
    await page.waitForTimeout(800);
    await expect(page.getByText("Pagamento confirmado! Seus NFTs estão na sua carteira.")).toHaveCount(0);
    await open(page, `/pedido/${orderId}`);
    await expect(page.getByRole("heading", { name: "Pedido não encontrado" })).toBeVisible();
  });
});

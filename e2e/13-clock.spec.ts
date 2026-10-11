import { expect, test } from "@playwright/test";
import { addToCart, login, mockState, USERS } from "./support";

/*
 * Time-sensitive scenarios with a controlled clock (Playwright page.clock): the mock backend runs
 * inside the page, so session expiry, quote TTL and order settlement all follow the fake clock and
 * the tests never sleep for real.
 */
test.describe("13. cenários sensíveis a tempo (relógio controlado)", () => {
  test.beforeEach(async ({ page }) => {
    await page.clock.install({ time: new Date("2026-10-10T12:00:00-03:00") });
  });

  async function toCheckout(page: import("@playwright/test").Page) {
    await login(page, "ana");
    await addToCart(page, "nft-042-0", 1);
    await page.getByRole("button", { name: "Conectar e finalizar" }).click();
    await expect(page.getByRole("button", { name: "Confirmar compra" })).toBeVisible();
  }

  test("sessão expira durante o checkout: o contexto é preservado e o usuário retoma o pagamento", async ({ page }) => {
    await toCheckout(page);
    const note = page.getByLabel("Observação do colecionador (opcional)");
    await note.fill("Presente de aniversário");

    // 31 minutes later the 30-minute session is gone.
    await page.clock.fastForward("31:00");
    await page.getByRole("button", { name: "Conectar carteira" }).click();

    await expect(page).toHaveURL(/\/entrar\?.*expired=true/);
    await expect(page.getByText("Sua sessão expirou. Entre novamente para continuar de onde parou.")).toBeVisible();
    await page.getByPlaceholder("contato@email.com").fill(USERS.ana.email);
    await page.getByPlaceholder("Senha", { exact: true }).fill(USERS.ana.password);
    await page.getByRole("button", { name: "Entrar", exact: true }).click();

    await expect(page).toHaveURL(/\/pagamento$/);
    await expect(page.getByLabel("Observação do colecionador (opcional)")).toHaveValue("Presente de aniversário");
    await expect(page.getByText("Emerald Ape #042")).toBeVisible();
  });

  test("pedido fica pendente até a liquidação simulada (2,5 s) e só então é confirmado", async ({ page }) => {
    await toCheckout(page);
    await page.getByRole("button", { name: "Conectar carteira" }).click();
    await expect(page.getByText(/Conectada na Ethereum/)).toBeVisible();
    await page.getByRole("button", { name: "Confirmar compra" }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Confirmar e pagar" }).click();
    await expect(page.getByRole("heading", { name: "Processando pagamento…" })).toBeVisible();

    await page.clock.runFor(1_000);
    expect((await mockState(page)).orders[0]!.status).toBe("pending");
    await expect(page.getByRole("heading", { name: "Processando pagamento…" })).toBeVisible();

    await page.clock.runFor(2_000);
    await expect(page.getByRole("heading", { name: "Seus NFTs agora estão na sua carteira" })).toBeVisible();
    expect((await mockState(page)).orders[0]!.status).toBe("confirmed");
  });

  test("cotação expira (5 min): o servidor recusa e a compra exige nova confirmação", async ({ page }) => {
    await toCheckout(page);
    await page.getByRole("button", { name: "Conectar carteira" }).click();
    await expect(page.getByText(/Conectada na Ethereum/)).toBeVisible();
    await page.getByRole("button", { name: "Confirmar compra" }).click();
    const dialog = page.getByRole("dialog", { name: "Revise sua compra" });
    await expect(dialog).toBeVisible();

    await page.clock.fastForward("06:00");
    await dialog.getByRole("button", { name: "Confirmar e pagar" }).click();
    await expect(dialog.getByText("A cotação expirou ou foi atualizada. Revise os valores e confirme novamente.")).toBeVisible();
    expect((await mockState(page)).orders).toHaveLength(0);

    await dialog.getByRole("button", { name: "Confirmar e pagar" }).click();
    await expect(page).toHaveURL(/\/pedido\//);
  });
});

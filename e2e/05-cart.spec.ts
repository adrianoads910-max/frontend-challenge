import { expect, test } from "@playwright/test";
import { addToCart, login, open, USERS } from "./support";

const summary = (page: import("@playwright/test").Page) => page.getByRole("complementary", { name: /Resumo da carteira/ });

test.describe("5. carrinho: quantidades, remoção, cupom e persistência", () => {
  test("altera quantidade e remove itens com totais vindos da API", async ({ page, isMobile }) => {
    await addToCart(page, "nft-042-0", 1);
    await addToCart(page, "nft-009-1", 1);
    // 1.19 + 1.69 = 2.88; + fee 0.016 = 2.896
    await expect(summary(page).getByText("2.896 ETH")).toBeVisible();

    const increase = page.getByRole("button", { name: "Aumentar quantidade de emerald ape #042" }).locator("visible=true");
    await increase.click();
    // 2 × 1.19 + 1.69 = 4.07 → 4.086
    await expect(summary(page).getByText("4.086 ETH")).toBeVisible();

    await page.getByRole("button", { name: "Remover Sage Nomad #009 do carrinho" }).locator("visible=true").click();
    await expect(page.getByText("Sage Nomad #009 removido do carrinho")).toBeVisible();
    await expect(summary(page).getByText("2.396 ETH")).toBeVisible();
    if (!isMobile) await expect(page.getByRole("cell", { name: /Sage Nomad/ })).toHaveCount(0);
  });

  test("cupom inválido, expirado e válido", async ({ page }) => {
    await addToCart(page, "nft-042-0", 1);
    const code = page.getByLabel("Código promocional");
    await code.fill("NAOEXISTE");
    await page.getByRole("button", { name: "Aplicar" }).click();
    await expect(page.getByRole("alert").filter({ hasText: "Cupom inválido" })).toBeVisible();
    await expect(code).toHaveAttribute("aria-invalid", "true");

    await code.fill("EXPIRADO");
    await page.getByRole("button", { name: "Aplicar" }).click();
    await expect(page.getByRole("alert").filter({ hasText: "Este cupom expirou" })).toBeVisible();

    await code.fill("kurio10");
    await page.getByRole("button", { name: "Aplicar" }).click();
    await expect(page.getByText("Cupom aplicado")).toBeVisible();
    // 10% of 1.19 = 0.119 → total 1.19 - 0.119 + 0.016 = 1.087
    await expect(summary(page).getByText("(-) 0.119")).toBeVisible();
    await expect(summary(page).getByText("1.087 ETH")).toBeVisible();

    await page.getByRole("button", { name: "Remover", exact: true }).click();
    await expect(summary(page).getByText("1.206 ETH")).toBeVisible();
  });

  test("carrinho persiste após refresh e os itens do visitante são mantidos ao autenticar", async ({ page }) => {
    await addToCart(page, "nft-207-6", 2);
    await page.reload();
    await expect(page.getByText("Golden Beat #207").locator("visible=true").first()).toBeVisible();

    await page.getByRole("button", { name: "Conectar e finalizar" }).click();
    await expect(page).toHaveURL(/\/entrar\?redirect=%2Fpagamento/);
    await page.getByPlaceholder("contato@email.com").fill(USERS.ana.email);
    await page.getByPlaceholder("Senha", { exact: true }).fill(USERS.ana.password);
    await page.getByRole("button", { name: "Entrar", exact: true }).click();
    await expect(page).toHaveURL(/\/pagamento$/);
    await expect(page.getByText("Golden Beat #207")).toBeVisible();
    await expect(page.getByText("(x 2)")).toBeVisible();

    await page.reload();
    await open(page, "/carrinho");
    await expect(page.getByText("Golden Beat #207").locator("visible=true").first()).toBeVisible();
  });

  test("login antes de comprar: carrinho da conta é usado e mantido entre sessões", async ({ page }) => {
    await login(page, "ana");
    await addToCart(page, "nft-160-7", 1);
    await page.getByRole("button", { name: "Conectar e finalizar" }).isVisible();
    await open(page, "/");
    await expect(page.getByRole("link", { name: /Carrinho, 1 item/ }).locator("visible=true").first()).toBeVisible();
  });
});

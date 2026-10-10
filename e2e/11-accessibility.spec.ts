import { expect, test } from "@playwright/test";
import { open } from "./support";

test.describe("11. teclado, foco de diálogos e validação de formulários", () => {
  test.skip(({ isMobile }) => isMobile, "keyboard flows are desktop-only");

  test("link de pular para o conteúdo e foco visível", async ({ page }) => {
    await open(page, "/");
    await expect(page.getByRole("link", { name: "Kurio — página inicial" })).toBeVisible();
    await page.keyboard.press("Tab");
    const skip = page.getByRole("link", { name: "Pular para o conteúdo" });
    await expect(skip).toBeFocused();
    await expect(skip).toBeVisible();
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/#conteudo$/);
  });

  test("diálogo de busca: abre pelo teclado, prende o foco, fecha com Esc e devolve o foco", async ({ page }) => {
    await open(page, "/");
    const trigger = page.getByRole("button", { name: "Buscar NFTs" });
    await trigger.focus();
    await page.keyboard.press("Enter");
    const dialog = page.getByRole("dialog", { name: "Buscar NFTs" });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByLabel("Nome do NFT")).toBeFocused();

    // Focus stays inside the dialog while tabbing.
    for (let i = 0; i < 6; i++) {
      await page.keyboard.press("Tab");
      // Base UI redirects focus from its focus guards asynchronously.
      await expect.poll(() => dialog.evaluate((el) => el.contains(document.activeElement))).toBe(true);
    }
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
    await expect(trigger).toBeFocused();
  });

  test("filtros e ordenação operáveis só pelo teclado", async ({ page }) => {
    await open(page, "/");
    const music = page.getByRole("complementary", { name: "Filtros" }).getByLabel(/^Música/);
    await music.focus();
    await page.keyboard.press("Space");
    await expect(page).toHaveURL(/music/);
    await page.getByLabel("Ordenar por").focus();
    await page.keyboard.press("ArrowDown");
    await expect(page).toHaveURL(/sort=/);
  });

  test("formulário de login: erros associados aos campos e foco no primeiro inválido", async ({ page }) => {
    await open(page, "/entrar");
    await page.getByRole("button", { name: "Entrar", exact: true }).click();
    const email = page.getByRole("textbox", { name: "E-mail", exact: true });
    await expect(email).toBeFocused();
    await expect(email).toHaveAttribute("aria-invalid", "true");
    await expect(email).toHaveAccessibleDescription("E-mail inválido");
    await expect(page.getByLabel("Senha", { exact: true })).toHaveAccessibleDescription("Informe a senha");
  });

  test("zoom de imagem no detalhe é um diálogo acessível", async ({ page }) => {
    await open(page, "/nft/nft-042-0");
    await page.getByRole("button", { name: "Ampliar imagem" }).click();
    const dialog = page.getByRole("dialog", { name: "Emerald Ape #042" });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole("img", { name: /ampliada/ })).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
    await expect(page.getByRole("button", { name: "Ampliar imagem" })).toBeFocused();
  });
});

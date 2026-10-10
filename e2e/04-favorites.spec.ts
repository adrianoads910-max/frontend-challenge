import { expect, test } from "@playwright/test";
import { login, mock, open } from "./support";

test.describe("4. favoritos (atualização otimista + rollback)", () => {
  test("favoritar persiste para o usuário autenticado (após refresh e na lista de interesse)", async ({ page }) => {
    await login(page, "ana");
    await open(page, "/");
    const heart = page.getByRole("button", { name: "Favoritar Emerald Ape #042" });
    await heart.click();
    await expect(page.getByRole("button", { name: "Remover Emerald Ape #042 dos favoritos" })).toHaveAttribute("aria-pressed", "true");
    // Optimistic first, then confirmed by the server.
    await expect(page.getByText("Adicionado aos favoritos")).toBeVisible();

    await page.reload();
    await expect(page.getByRole("button", { name: "Remover Emerald Ape #042 dos favoritos" })).toBeVisible();
    await open(page, "/favoritos");
    await expect(page.getByRole("link", { name: "Emerald Ape #042" })).toBeVisible();
  });

  test("falha da mutation desfaz a marcação otimista e informa o erro; nova tentativa funciona", async ({ page }) => {
    await login(page, "ana");
    await open(page, "/");
    await expect(page.getByRole("button", { name: "Favoritar Sage Nomad #009" })).toBeVisible();
    await mock(page, "fail-next", { pattern: "^/api/me/favorites/", method: "PUT", status: 503, code: "TRANSIENT" });

    await page.getByRole("button", { name: "Favoritar Sage Nomad #009" }).click();
    await expect(page.getByText("Não foi possível favoritar Sage Nomad #009.")).toBeVisible();
    // Rolled back.
    await expect(page.getByRole("button", { name: "Favoritar Sage Nomad #009" })).toHaveAttribute("aria-pressed", "false");

    await page.getByRole("button", { name: "Favoritar Sage Nomad #009" }).click();
    await expect(page.getByRole("button", { name: "Remover Sage Nomad #009 dos favoritos" })).toHaveAttribute("aria-pressed", "true");
  });

  test("visitante é levado ao login ao favoritar", async ({ page }) => {
    await open(page, "/");
    await page.getByRole("button", { name: "Favoritar Emerald Ape #042" }).click();
    await expect(page).toHaveURL(/\/entrar\?redirect=/);
  });
});

import { expect, test } from "@playwright/test";
import { addToCart, login, mock, open, USERS } from "./support";

test.describe("3. cadastro, login, expiração de sessão, logout e troca de usuário", () => {
  test("cadastro valida campos, trata conflito (409) e cria a conta", async ({ page }) => {
    await open(page, "/cadastro");
    await page.getByRole("button", { name: "Criar perfil" }).click();
    await expect(page.getByText("3 a 24 caracteres: letras minúsculas, números e _")).toBeVisible();
    await expect(page.getByText("E-mail inválido")).toBeVisible();
    // Focus goes to the first invalid field.
    await expect(page.getByPlaceholder("Nome de usuário")).toBeFocused();

    await page.getByPlaceholder("Nome de usuário").fill("nova_colecionadora");
    await page.getByPlaceholder("Digite seu e-mail", { exact: true }).fill(USERS.ana.email); // already registered
    await page.getByPlaceholder("Senha", { exact: true }).fill("Segredo123");
    await page.getByPlaceholder("Confirmar senha").fill("Segredo124");
    await page.getByRole("button", { name: "Criar perfil" }).click();
    await expect(page.getByText("As senhas não coincidem")).toBeVisible();

    await page.getByPlaceholder("Confirmar senha").fill("Segredo123");
    await page.getByRole("button", { name: "Criar perfil" }).click();
    await expect(page.getByText("Este e-mail já está cadastrado")).toBeVisible();
    await expect(page.getByPlaceholder("Digite seu e-mail", { exact: true })).toHaveAttribute("aria-invalid", "true");

    await page.getByPlaceholder("Digite seu e-mail", { exact: true }).fill("nova@kurio.dev");
    await page.getByRole("button", { name: "Criar perfil" }).click();
    await expect(page.getByText("Perfil de colecionador criado!")).toBeVisible();
    await expect(page).toHaveURL(/\/$/);
  });

  test("login com credenciais inválidas mostra erro; login válido volta ao fluxo anterior", async ({ page }) => {
    await open(page, "/entrar?redirect=%2Fcarteiras");
    await page.getByPlaceholder("contato@email.com").fill(USERS.ana.email);
    await page.getByPlaceholder("Senha", { exact: true }).fill("errada123");
    await page.getByRole("button", { name: "Entrar", exact: true }).click();
    await expect(page.getByRole("alert").filter({ hasText: "E-mail ou senha incorretos" })).toBeVisible();

    await page.getByPlaceholder("Senha", { exact: true }).fill(USERS.ana.password);
    await page.getByRole("button", { name: "Entrar", exact: true }).click();
    await expect(page).toHaveURL(/\/carteiras$/);
    await expect(page.getByRole("heading", { name: "Carteira principal" })).toBeVisible();
  });

  test("rota privada sem sessão redireciona para o login e retorna depois", async ({ page }) => {
    await open(page, "/perfil");
    await expect(page).toHaveURL(/\/entrar\?redirect=%2Fperfil/);
    await page.getByPlaceholder("contato@email.com").fill(USERS.ana.email);
    await page.getByPlaceholder("Senha", { exact: true }).fill(USERS.ana.password);
    await page.getByRole("button", { name: "Entrar", exact: true }).click();
    await expect(page).toHaveURL(/\/perfil$/);
  });

  test("sessão recuperada após refresh; expiração durante a navegação preserva o contexto", async ({ page }) => {
    await login(page, "ana");
    await page.reload();
    await open(page, "/perfil");
    await expect(page.getByLabel(/Nome de exibição/)).toHaveValue(USERS.ana.name);

    await mock(page, "sessions/expire");
    await open(page, "/carteiras");
    await expect(page).toHaveURL(/\/entrar\?.*expired=true/);
    await expect(page.getByText("Sua sessão expirou. Entre novamente para continuar de onde parou.")).toBeVisible();
    await page.getByPlaceholder("contato@email.com").fill(USERS.ana.email);
    await page.getByPlaceholder("Senha", { exact: true }).fill(USERS.ana.password);
    await page.getByRole("button", { name: "Entrar", exact: true }).click();
    await expect(page).toHaveURL(/\/carteiras$/);
  });

  test("logout e troca de usuário limpam dados privados da sessão anterior", async ({ page }) => {
    await login(page, "ana");
    await addToCart(page, "nft-042-0", 1);
    await open(page, "/perfil");
    await expect(page.getByLabel(/Nome de exibição/)).toHaveValue(USERS.ana.name);

    // Logout via the account sidebar.
    await page.getByRole("button", { name: "Sair" }).click();
    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByRole("link", { name: /Carrinho, 0 itens/ }).first()).toBeAttached();

    await login(page, "bruno");
    await open(page, "/perfil");
    await expect(page.getByLabel(/Nome de exibição/)).toHaveValue(USERS.bruno.name);
    await open(page, "/carrinho");
    await expect(page.getByText("Seu carrinho está vazio.")).toBeVisible();
    await open(page, "/carteiras");
    // Ana's wallet must not leak into Bruno's account.
    await expect(page.getByText("0x8ba1f109551bD432803012645Ac136ddd64DBA72")).toHaveCount(0);
  });
});

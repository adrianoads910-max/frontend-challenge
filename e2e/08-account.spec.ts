import path from "node:path";
import { expect, test } from "@playwright/test";
import { login, open } from "./support";

test.describe("8. perfil, avatar, senha e carteiras", () => {
  test("edição do perfil com validação e persistência após refresh", async ({ page }) => {
    await login(page, "ana");
    await open(page, "/perfil");
    const name = page.getByLabel(/Nome de exibição/);
    await expect(name).toHaveValue("Ana Colecionadora");

    await name.fill("A");
    await page.getByLabel(/Nome ENS/).fill("Inválido!");
    await page.getByRole("button", { name: "Salvar" }).click();
    await expect(page.getByText("Mínimo de 2 caracteres")).toBeVisible();
    await expect(name).toBeFocused();

    // Server-side conflict: Bruno's username.
    await name.fill("Ana K.");
    await page.getByLabel(/Nome ENS/).fill("anakurio");
    await page.getByLabel(/Nome de usuário/).fill("bruno_art");
    await page.getByRole("button", { name: "Salvar" }).click();
    await expect(page.getByText("Este nome de usuário já está em uso")).toBeVisible();

    await page.getByLabel(/Nome de usuário/).fill("ana_k");
    await page.getByRole("button", { name: "Salvar" }).click();
    await expect(page.getByText("Perfil atualizado")).toBeVisible();
    await page.reload();
    await expect(page.getByLabel(/Nome de exibição/)).toHaveValue("Ana K.");
    await expect(page.getByLabel(/Nome de usuário/)).toHaveValue("ana_k");
  });

  test("avatar: envio e remoção", async ({ page }) => {
    await login(page, "ana");
    await open(page, "/perfil");
    const chooser = page.waitForEvent("filechooser");
    await page.getByRole("button", { name: "Alterar" }).click();
    await (await chooser).setFiles(path.join(import.meta.dirname, "../public/images/nfts/ape-varsity-256.webp"));
    await expect(page.getByText("Avatar atualizado")).toBeVisible();
    await page.reload();
    await expect(page.getByRole("button", { name: "Remover" })).toBeEnabled();
    await page.getByRole("button", { name: "Remover" }).click();
    await expect(page.getByText("Avatar removido")).toBeVisible();
    await expect(page.getByLabel("Sem avatar")).toBeVisible();
  });

  test("alteração de senha: senha atual errada, confirmação divergente e sucesso", async ({ page }) => {
    await login(page, "ana");
    await open(page, "/perfil");
    await page.getByLabel("Senha atual").fill("errada123");
    await page.getByLabel("Nova senha", { exact: true }).fill("NovaSenha9");
    await page.getByLabel("Confirmar nova senha").fill("NovaSenha8");
    await page.getByRole("button", { name: "Salvar" }).click();
    await expect(page.getByText("As senhas não coincidem")).toBeVisible();

    await page.getByLabel("Confirmar nova senha").fill("NovaSenha9");
    await page.getByRole("button", { name: "Salvar" }).click();
    await expect(page.getByText("Senha atual incorreta").first()).toBeVisible();

    await page.getByLabel("Senha atual").fill("Kurio2026");
    await page.getByRole("button", { name: "Salvar" }).click();
    await expect(page.getByText("Perfil e senha atualizados")).toBeVisible();
    await expect(page.getByLabel("Senha atual")).toHaveValue("");
  });

  test("carteiras: validação de endereço, cadastro da secundária e edição da principal", async ({ page }) => {
    await login(page, "bruno"); // no wallets yet
    await open(page, "/carteiras");
    await expect(page.getByText("Cadastre a carteira principal antes da secundária.")).toBeVisible();

    const form = page.locator("#primary-form");
    await form.getByLabel(/Nome de exibição/).fill("Bruno Criador");
    await form.getByLabel(/Apelido da carteira/).fill("Estúdio");
    await form.getByLabel(/^Rede/).selectOption("ethereum");
    await form.getByLabel(/Nome do perfil/).fill("brunoart");
    await form.getByLabel(/Endereço da carteira/).fill("0x123");
    await form.getByLabel(/Tipo de carteira/).selectOption("coinbase");
    await form.getByLabel(/Código de indicação/).fill("bruno1");
    await form.getByLabel(/E-mail/).fill("bruno@kurio.dev");
    await form.getByLabel(/Nome ENS/).fill("brunoart");
    await form.getByRole("button", { name: "Salvar carteira" }).click();
    await expect(form.getByText("Endereço 0x inválido (40 hexadecimais)")).toBeVisible();

    await form.getByLabel(/Endereço da carteira/).fill("0x2546BcD3c84621e976D8185a91A922aE77ECEc30");
    await form.getByRole("button", { name: "Salvar carteira" }).click();
    await expect(page.getByText("Carteira principal salva")).toBeVisible();
    await expect(page.getByText("0x2546BcD3c84621e976D8185a91A922aE77ECEc30")).toBeVisible();

    // Secondary wallet, prefilled from the primary.
    await page.getByLabel("Igual à carteira principal").check();
    await page.getByRole("button", { name: "Adicionar" }).click();
    const secondary = page.locator("#secondary-form");
    await expect(secondary.getByLabel(/Nome de exibição/)).toHaveValue("Bruno Criador");
    await secondary.getByLabel(/Apelido da carteira/).fill("Reserva");
    await secondary.getByLabel(/Endereço da carteira/).fill("0x2546BcD3c84621e976D8185a91A922aE77ECEc30");
    await secondary.getByRole("button", { name: "Salvar carteira" }).click();
    await expect(secondary.getByText("Este endereço já está cadastrado em outra carteira")).toBeVisible();
    await secondary.getByLabel(/Endereço da carteira/).fill("0xbDA5747bFD65F08deb54cb465eB87D40e51B197E");
    await secondary.getByRole("button", { name: "Salvar carteira" }).click();
    await expect(page.getByText("Carteira secundária salva")).toBeVisible();

    await page.reload();
    await expect(page.getByText("0xbDA5747bFD65F08deb54cb465eB87D40e51B197E")).toBeVisible();
  });
});

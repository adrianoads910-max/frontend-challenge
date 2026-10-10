import { expect, type Page } from "@playwright/test";

/*
 * Test helpers. The mock backend lives in the page (MSW), so control-plane calls go through the
 * page's fetch → Service Worker → /__mock handlers. The UI under test never sees these calls: it
 * only observes the resulting REST responses and Socket.IO events.
 */

export const USERS = {
  ana: { email: "ana@kurio.dev", password: "Kurio2026", name: "Ana Colecionadora" },
  bruno: { email: "bruno@kurio.dev", password: "Kurio2026", name: "Bruno Criador" },
} as const;

/** Opens a route and waits until the mock backend answered the first API call. */
export async function open(page: Page, path: string, scenario?: string) {
  const url = scenario ? `${path}${path.includes("?") ? "&" : "?"}scenario=${scenario}` : path;
  await page.goto(url);
  await page.waitForFunction(() => Boolean(navigator.serviceWorker?.controller));
}

export async function mock<T = unknown>(page: Page, path: string, body: object = {}): Promise<T> {
  return page.evaluate(
    async ([p, b]) => {
      const res = await fetch(`/__mock/${p}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(b) });
      return res.json();
    },
    [path, body] as const,
  ) as Promise<T>;
}

export async function mockState(page: Page) {
  return page.evaluate(async () => (await fetch("/__mock/state")).json()) as Promise<{
    scenario: string;
    sockets: number;
    nfts: Array<{ id: string; name: string; price: string; version: number }>;
    orders: Array<{ id: string; status: string; version: number }>;
  }>;
}

export async function setScenario(page: Page, id: string) {
  await mock(page, "scenario", { id });
}

export async function login(page: Page, user: keyof typeof USERS = "ana", redirect?: string) {
  await open(page, `/entrar${redirect ? `?redirect=${encodeURIComponent(redirect)}` : ""}`);
  await page.getByPlaceholder("contato@email.com").fill(USERS[user].email);
  await page.getByPlaceholder("Senha", { exact: true }).fill(USERS[user].password);
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
  await expect(page.getByText(`Bem-vindo(a), ${USERS[user].name}!`)).toBeVisible();
}

/** Adds an edition of an NFT through the detail page (desktop or mobile layout). */
export async function addToCart(page: Page, nftId: string, quantity = 1) {
  await open(page, `/nft/${nftId}`);
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  const increase = page.getByRole("button", { name: "Aumentar quantidade" }).locator("visible=true").first();
  for (let i = 1; i < quantity; i++) await increase.click();
  const buy = page.getByRole("button", { name: /^(COMPRAR|Comprar NFT)$/ }).locator("visible=true").first();
  await buy.click();
  await expect(page).toHaveURL(/\/carrinho$/);
}

/** Waits until the realtime socket of the page is connected (control plane counts sockets). */
export async function waitForSocket(page: Page) {
  await expect.poll(async () => (await mockState(page)).sockets, { timeout: 10_000 }).toBeGreaterThan(0);
}

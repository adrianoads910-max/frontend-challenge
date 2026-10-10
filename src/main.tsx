import "./index.css";
import { markMocksReady } from "./lib/mocks-ready";

async function boot() {
  if (import.meta.env.VITE_ENABLE_MOCKS !== "false") {
    const { startMockBackend } = await import("./mocks/browser");
    await startMockBackend().catch((err) => console.error("[mocks] failed to start", err));
  }
  markMocksReady();
  const { mountApp } = await import("./app/mount");
  mountApp(document.getElementById("root")!);
}

void boot();

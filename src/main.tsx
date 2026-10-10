import "./index.css";

/**
 * Boot order matters: the mock backend must be running before the app module graph is evaluated,
 * because engine.io (socket.io-client) captures the WebSocket constructor at import time. With a
 * static import it would bypass MSW's WebSocket interception.
 */
async function boot() {
  if (import.meta.env.VITE_ENABLE_MOCKS !== "false") {
    const { startMockBackend } = await import("./mocks/browser");
    await startMockBackend();
  }
  const { mountApp } = await import("./app/mount");
  mountApp(document.getElementById("root")!);
}

void boot();

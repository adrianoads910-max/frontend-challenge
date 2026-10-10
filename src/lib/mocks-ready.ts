/**
 * Resolves when the mock backend (MSW) is active, or immediately when mocks are disabled.
 * The UI renders before that (static content, skeletons); only network access waits:
 *  - axios requests (interceptor in lib/http.ts);
 *  - socket.io-client, which is imported only after this resolves because engine.io captures the
 *    WebSocket constructor at import time and must see MSW's patched one.
 */
let resolveReady!: () => void;
export const mocksReady = new Promise<void>((resolve) => {
  resolveReady = resolve;
});
export const markMocksReady = () => resolveReady();

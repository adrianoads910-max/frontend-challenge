import { redirect } from "@tanstack/react-router";
import type { RouterContext } from "./context";

/** beforeLoad guard for private routes: sends guests to /entrar and brings them back afterwards. */
export function requireAuth({ context, location }: { context: RouterContext; location: { href: string } }) {
  if (!context.session()) {
    throw redirect({ to: "/entrar", search: { redirect: location.href } });
  }
}

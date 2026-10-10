import { Link, useRouterState } from "@tanstack/react-router";
import { Heart } from "lucide-react";
import { Icon } from "@/components/icon";
import { useCart } from "@/hooks/data";
import { cn } from "@/lib/utils";

/** Bottom navigation of the mobile frames (home, favourites, market, cart, profile). */
export function MobileTabBar() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { data: cart } = useCart();
  const count = cart?.itemCount ?? 0;
  const tab = (active: boolean) =>
    cn("grid size-11 place-items-center rounded-full transition-colors", active ? "text-copper" : "text-sand hover:text-cream");

  return (
    <nav aria-label="Navegação inferior" className="fixed inset-x-0 bottom-0 z-40 md:hidden">
      <div className="relative mx-auto flex h-[72px] max-w-[480px] items-center justify-between rounded-t-[32px] bg-surface-card px-6 shadow-[0_-8px_24px_rgb(10_6_4/0.45)]">
        <Link to="/" className={tab(pathname === "/")} aria-label="Início" aria-current={pathname === "/" ? "page" : undefined}>
          <Icon name="home" />
        </Link>
        <Link to="/favoritos" className={tab(pathname === "/favoritos")} aria-label="Favoritos" aria-current={pathname === "/favoritos" ? "page" : undefined}>
          <Heart className="size-5" fill="currentColor" aria-hidden />
        </Link>
        <Link
          to="/"
          hash="catalogo"
          aria-label="Mercado"
          className="-mt-12 grid size-16 place-items-center rounded-full border-4 border-ink bg-copper text-ink shadow-lg hover:bg-copper-light"
        >
          <Icon name="image-2" />
        </Link>
        <Link to="/carrinho" className={cn(tab(pathname === "/carrinho"), "relative")} aria-label={`Carrinho, ${count} ${count === 1 ? "item" : "itens"}`}>
          <Icon name="shop" />
          {count > 0 && (
            <span aria-hidden className="absolute top-1 right-0.5 grid size-4 place-items-center rounded-full bg-copper text-[9px] font-bold text-ink">
              {count > 99 ? "99+" : count}
            </span>
          )}
        </Link>
        <Link to="/perfil" className={tab(pathname.startsWith("/perfil") || pathname.startsWith("/carteiras"))} aria-label="Perfil">
          <Icon name="user-mobile" />
        </Link>
      </div>
    </nav>
  );
}

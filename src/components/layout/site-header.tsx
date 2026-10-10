import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { useState } from "react";
import { Icon } from "@/components/icon";
import { Button, buttonVariants } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { useServices } from "@/app/context";
import { useCart } from "@/hooks/data";
import { useSession } from "@/lib/session";
import { cn } from "@/lib/utils";
import { OutOfScopeLink } from "./out-of-scope";
import { UserAvatar } from "./user-avatar";

const MARKET_PATHS = ["/nft", "/carrinho", "/pagamento", "/pedido"];

export function SiteHeader() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const session = useSession();
  const { data: cart } = useCart();
  const [searchOpen, setSearchOpen] = useState(false);
  const inMarket = MARKET_PATHS.some((p) => pathname.startsWith(p));
  const count = cart?.itemCount ?? 0;

  const navItem = "relative py-[22px] text-[15px] transition-colors hover:text-copper-light";
  const active = "text-copper-light font-bold after:absolute after:inset-x-0 after:bottom-0 after:h-[3px] after:rounded-full after:bg-copper";

  return (
    <header className="hidden border-b border-line md:block">
      <div className="container-page flex h-[68px] items-center justify-between">
        <Link to="/" className="text-sm font-bold tracking-[0.1em]" aria-label="Kurio — página inicial">
          KURIO
        </Link>
        <nav aria-label="Principal" className="flex items-center gap-10">
          <Link to="/" className={cn(navItem, pathname === "/" && active)} aria-current={pathname === "/" ? "page" : undefined}>
            Início
          </Link>
          <Link to="/" hash="catalogo" className={cn(navItem, inMarket && active)} aria-current={inMarket ? "page" : undefined}>
            Mercado
          </Link>
          <OutOfScopeLink label="Criadores" className={navItem} />
          <OutOfScopeLink label="Aprenda" className={navItem} />
        </nav>
        <div className="flex items-center gap-5">
          <button type="button" onClick={() => setSearchOpen(true)} className="rounded-md p-1 hover:text-copper-light" aria-label="Buscar NFTs">
            <Icon name="search" />
          </button>
          <Link to="/carrinho" className="relative rounded-md p-1 hover:text-copper-light" aria-label={`Carrinho, ${count} ${count === 1 ? "item" : "itens"}`}>
            <Icon name="shop" />
            {count > 0 && (
              <span aria-hidden className="absolute -top-0.5 -right-1.5 grid size-4 place-items-center rounded-full bg-copper text-[9px] font-bold text-ink">
                {count > 99 ? "99+" : count}
              </span>
            )}
          </Link>
          {session ? <AccountMenu /> : <SignInButton />}
        </div>
      </div>
      <SearchDialog open={searchOpen} onOpenChange={setSearchOpen} />
    </header>
  );
}

function SignInButton() {
  const href = useRouterState({ select: (s) => s.location.href });
  return (
    <Link
      to="/entrar"
      search={{ redirect: href.startsWith("/entrar") ? undefined : href }}
      className={cn(buttonVariants({ size: "sm" }), "h-[34px] gap-1.5 rounded-md px-2.5 text-[15px]")}
    >
      <Icon name="logout" className="text-ink" /> Entrar
    </Link>
  );
}

function AccountMenu() {
  const session = useSession()!;
  const { lifecycle } = useServices();
  const navigate = useNavigate();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="rounded-full focus-visible:outline-2" aria-label={`Conta de ${session.user.displayName}`}>
        <UserAvatar user={session.user} className="size-9" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-48">
        <div className="px-2 py-1.5 text-xs text-sand">{session.user.email}</div>
        <DropdownMenuItem onClick={() => navigate({ to: "/perfil" })}>Dados do perfil</DropdownMenuItem>
        <DropdownMenuItem onClick={() => navigate({ to: "/carteiras" })}>Carteiras</DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onClick={async () => {
            await lifecycle.signOut();
            void navigate({ to: "/" });
          }}
        >
          Sair
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function SearchDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const navigate = useNavigate();
  const [value, setValue] = useState("");
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Buscar NFTs</DialogTitle>
          <DialogDescription>Procure pelo nome da obra.</DialogDescription>
        </DialogHeader>
        <form
          role="search"
          onSubmit={(e) => {
            e.preventDefault();
            onOpenChange(false);
            void navigate({ to: "/", search: (prev) => ({ ...prev, q: value.trim() || undefined, page: undefined }), hash: "catalogo" });
          }}
          className="flex gap-2"
        >
          <label htmlFor="global-search" className="sr-only">Nome do NFT</label>
          <Input id="global-search" value={value} onChange={(e) => setValue(e.target.value)} placeholder="Ex.: Emerald Ape" autoFocus />
          <Button type="submit">Buscar</Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

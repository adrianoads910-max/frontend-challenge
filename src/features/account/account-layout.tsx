import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { Heart } from "lucide-react";
import type { ReactNode } from "react";
import { useServices } from "@/app/context";
import { Icon, type IconName } from "@/components/icon";
import { OutOfScopeLink } from "@/components/layout/out-of-scope";
import { cn } from "@/lib/utils";

const item = "flex items-center gap-3 border-l-[6px] px-3 py-3 text-[15px] text-copper-light transition-colors hover:bg-surface-raised";

/** "Meu perfil" sidebar from the Figma (profile + wallets frames). */
export function AccountLayout({ children }: { children: ReactNode }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { lifecycle } = useServices();
  const navigate = useNavigate();
  const link = (to: "/perfil" | "/carteiras" | "/favoritos", label: string, icon: ReactNode) => (
    <li>
      <Link to={to} aria-current={pathname === to ? "page" : undefined} className={cn(item, pathname === to ? "border-copper bg-surface-raised" : "border-transparent")}>
        {icon} {label}
      </Link>
    </li>
  );
  const outOfScope = (label: string, icon: IconName) => (
    <li>
      <OutOfScopeLink label={label} className={cn(item, "w-full border-transparent")}>
        <Icon name={icon} /> {label}
      </OutOfScopeLink>
    </li>
  );

  return (
    <div className="container-page grid gap-8 py-8 md:py-[34px] lg:grid-cols-[310px_1fr] lg:gap-7">
      <nav aria-label="Meu perfil" className="h-fit rounded-sm bg-surface-card">
        <h2 className="px-2.5 pt-4 pb-2 text-lg font-bold">Meu perfil</h2>
        <ul className="grid grid-cols-2 sm:grid-cols-3 lg:block">
          {link("/perfil", "Dados do perfil", <Icon name="user" />)}
          {link("/carteiras", "Carteiras", <Icon name="location" />)}
          {outOfScope("Atividade", "shop")}
          {link("/favoritos", "Lista de interesse", <Heart className="size-[18px]" aria-hidden />)}
          {outOfScope("Ofertas", "activity")}
          {outOfScope("Arquivos baixados", "download")}
          {outOfScope("Suporte", "danger-triangle")}
        </ul>
        <button
          type="button"
          onClick={async () => {
            await lifecycle.signOut();
            void navigate({ to: "/" });
          }}
          className={cn(item, "w-full border-t border-l-transparent border-t-line font-bold")}
        >
          <Icon name="logout" /> Sair
        </button>
      </nav>
      <div className="min-w-0">{children}</div>
    </div>
  );
}

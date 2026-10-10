import { useNavigate, useRouterState } from "@tanstack/react-router";
import { Heart } from "lucide-react";
import { useFavorites, useToggleFavorite } from "@/hooks/data";
import { useSession } from "@/lib/session";
import { cn } from "@/lib/utils";

/**
 * Optimistic favourite toggle (rolls back on failure, see useToggleFavorite). Guests are sent to
 * the login page and come back to where they were.
 */
export function FavoriteButton({ nftId, name, className, size = "md" }: { nftId: string; name: string; className?: string; size?: "md" | "lg" }) {
  const session = useSession();
  const navigate = useNavigate();
  const href = useRouterState({ select: (s) => s.location.href });
  const { data } = useFavorites();
  const toggle = useToggleFavorite();
  const favorite = data?.nftIds.includes(nftId) ?? false;

  return (
    <button
      type="button"
      aria-pressed={favorite}
      aria-label={favorite ? `Remover ${name} dos favoritos` : `Favoritar ${name}`}
      onClick={(e) => {
        e.preventDefault();
        if (!session) {
          void navigate({ to: "/entrar", search: { redirect: href } });
          return;
        }
        toggle.mutate({ nftId, favorite: !favorite, name });
      }}
      className={cn(
        "relative z-10 grid place-items-center rounded-full border border-line bg-ink/80 text-copper-light backdrop-blur transition-colors hover:bg-surface-raised",
        size === "lg" ? "size-[58px]" : "size-[34px]",
        className,
      )}
    >
      <Heart className={size === "lg" ? "size-6" : "size-4"} fill={favorite ? "currentColor" : "none"} aria-hidden />
    </button>
  );
}

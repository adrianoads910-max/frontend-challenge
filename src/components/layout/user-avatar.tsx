import type { User } from "@/api/contracts";
import { cn } from "@/lib/utils";

export function UserAvatar({ user, className }: { user: Pick<User, "displayName" | "avatarUrl">; className?: string }) {
  const initials = user.displayName
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join("");
  return user.avatarUrl ? (
    <img src={user.avatarUrl} alt="" className={cn("rounded-full border border-line object-cover", className)} />
  ) : (
    <span aria-hidden className={cn("grid place-items-center rounded-full border border-line bg-surface-raised text-xs font-bold text-copper-light", className)}>
      {initials}
    </span>
  );
}

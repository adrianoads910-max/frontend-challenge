import { cn } from "@/lib/utils";

/*
 * Icons exported from the Figma file (Iconly set) — src/assets/icons/*.svg. The original geometry
 * is kept untouched; only the hard-coded fill/stroke colours are swapped for `currentColor` so an
 * icon follows its context (hover, active tab, disabled). Documented in ARCHITECTURE.md (assets).
 */

const raw = import.meta.glob<string>("../assets/icons/*.svg", { query: "?raw", import: "default", eager: true });

const ICONS: Record<string, string> = Object.fromEntries(
  Object.entries(raw).map(([path, svg]) => [
    path.split("/").pop()!.replace(".svg", ""),
    svg.replace(/(fill|stroke)="#[0-9A-Fa-f]{3,8}"/g, '$1="currentColor"'),
  ]),
);

export type IconName =
  | "activity" | "arrow-down" | "arrow-down-2" | "arrow-left-2" | "arrow-right" | "arrow-right-2" | "close"
  | "close-small" | "danger-triangle" | "delete" | "download" | "filter" | "hide" | "home" | "image-2"
  | "linkedin" | "location" | "logout" | "message" | "search" | "shop" | "star" | "twitter" | "user"
  | "user-mobile" | "wallet" | "thank-you";

export function Icon({ name, size, className, label }: { name: IconName; size?: number; className?: string; label?: string }) {
  const svg = ICONS[name];
  if (!svg) return null;
  const sized = size ? svg.replace(/width="\d+"/, `width="${size}"`).replace(/height="\d+"/, `height="${size}"`) : svg;
  return (
    <span
      className={cn("inline-flex shrink-0 [&>svg]:block", className)}
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      // Static, build-time SVG from our own repository (never user content).
      dangerouslySetInnerHTML={{ __html: sized }}
    />
  );
}

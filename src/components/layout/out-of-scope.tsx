import type { ReactNode } from "react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

/**
 * Auxiliary destinations that are not part of the delivery (editorial pages, support, activity,
 * offers, downloads…). They stay visible to preserve the layout but never pretend to work: they
 * announce that the section is unavailable in this demo.
 */
export function notAvailable(label: string) {
  toast.info(`“${label}” não está disponível nesta demonstração.`);
}

export function OutOfScopeLink({ label, children, className }: { label: string; children?: ReactNode; className?: string }) {
  return (
    <button
      type="button"
      onClick={() => notAvailable(label)}
      aria-description="Indisponível nesta demonstração"
      className={cn("cursor-pointer text-left hover:text-copper-light focus-visible:text-copper-light", className)}
    >
      {children ?? label}
    </button>
  );
}

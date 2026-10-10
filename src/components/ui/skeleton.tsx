import { cn } from "@/lib/utils"

/** Placeholder with a shimmer sweep (disabled under prefers-reduced-motion). Decorative: hidden from AT. */
function Skeleton({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="skeleton"
      aria-hidden="true"
      className={cn("shimmer rounded-md", className)}
      {...props}
    />
  )
}

export { Skeleton }

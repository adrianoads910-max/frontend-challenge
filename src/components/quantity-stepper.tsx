import { Minus, Plus } from "lucide-react";
import { cn } from "@/lib/utils";

/** Integer quantity control bounded by [1, max]; announces the value politely. */
export function QuantityStepper({
  id,
  value,
  max,
  onChange,
  disabled,
  compact,
  label = "Quantidade",
}: {
  id: string;
  value: number;
  max: number;
  onChange: (v: number) => void;
  disabled?: boolean;
  compact?: boolean;
  label?: string;
}) {
  const btn = cn(
    "grid place-items-center rounded-full bg-copper text-ink transition-opacity hover:bg-copper-light disabled:cursor-not-allowed disabled:opacity-40",
    compact ? "size-7" : "size-[30px]",
  );
  return (
    <div className="flex items-center gap-3" role="group" aria-labelledby={`${id}-label`}>
      <span id={`${id}-label`} className="sr-only">{label}</span>
      <button type="button" className={btn} onClick={() => onChange(value - 1)} disabled={disabled || value <= 1} aria-label={`Diminuir ${label.toLowerCase()}`}>
        <Minus className="size-4" aria-hidden />
      </button>
      <output id={id} aria-live="polite" className="min-w-5 text-center text-lg">{value}</output>
      <button type="button" className={btn} onClick={() => onChange(value + 1)} disabled={disabled || value >= max} aria-label={`Aumentar ${label.toLowerCase()}`}>
        <Plus className="size-4" aria-hidden />
      </button>
      {!compact && max > 0 && value >= max && <span className="text-xs text-sand">Limite atingido</span>}
    </div>
  );
}

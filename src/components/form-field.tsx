import { Eye, EyeOff } from "lucide-react";
import { useId, useState, type ComponentProps, type ReactNode } from "react";
import { cn } from "@/lib/utils";

/*
 * Accessible field primitives: <label for>, aria-invalid and aria-describedby wire the error
 * message to the control, so screen readers read "E-mail, inválido, Este e-mail já está…".
 */

export const inputClass =
  "h-10 w-full rounded-sm border border-line-soft bg-transparent px-3 text-sm text-cream placeholder:text-khaki transition-colors hover:border-copper/70 focus-visible:border-copper aria-invalid:border-coral disabled:opacity-60";

interface FieldProps {
  label: ReactNode;
  required?: boolean;
  error?: string;
  hint?: ReactNode;
  className?: string;
  /** Visually hide the label (it stays available to assistive technology). */
  hideLabel?: boolean;
  children: (props: { id: string; "aria-invalid": boolean; "aria-describedby"?: string; "aria-required"?: boolean }) => ReactNode;
}

export function Field({ label, required, error, hint, className, hideLabel, children }: FieldProps) {
  const id = useId();
  // The hint is replaced by the error while there is one (they usually state the same rule).
  const showHint = Boolean(hint) && !error;
  const describedBy = [error ? `${id}-error` : null, showHint ? `${id}-hint` : null].filter(Boolean).join(" ") || undefined;
  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <label htmlFor={id} className={cn("text-[15px]", hideLabel && "sr-only")}>
        {label}
        {required && (
          <span className="text-coral" aria-hidden>
            *
          </span>
        )}
        {required && <span className="sr-only"> (obrigatório)</span>}
      </label>
      {children({ id, "aria-invalid": Boolean(error), "aria-describedby": describedBy, "aria-required": required || undefined })}
      {showHint && (
        <p id={`${id}-hint`} className="text-xs text-sand">
          {hint}
        </p>
      )}
      {error && (
        <p id={`${id}-error`} className="text-xs text-coral">
          {error}
        </p>
      )}
    </div>
  );
}

export function TextInput({ className, ...props }: ComponentProps<"input">) {
  return <input className={cn(inputClass, className)} {...props} />;
}

export function PasswordInput({ className, ...props }: Omit<ComponentProps<"input">, "type">) {
  const [visible, setVisible] = useState(false);
  return (
    <div className="relative">
      <input type={visible ? "text" : "password"} className={cn(inputClass, "pr-11", className)} {...props} />
      <button
        type="button"
        onClick={() => setVisible((v) => !v)}
        aria-label={visible ? "Ocultar senha" : "Mostrar senha"}
        aria-pressed={visible}
        className="absolute inset-y-0 right-0 grid w-10 place-items-center text-khaki hover:text-copper-light"
      >
        {visible ? <Eye className="size-4" aria-hidden /> : <EyeOff className="size-4" aria-hidden />}
      </button>
    </div>
  );
}

export function FormAlert({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <p role="alert" className="rounded-md border border-coral/60 bg-coral/10 px-3 py-2 text-sm text-coral">
      {message}
    </p>
  );
}

import { Link, useNavigate } from "@tanstack/react-router";
import { X } from "lucide-react";
import type { ReactNode } from "react";
import { notAvailable } from "@/components/layout/out-of-scope";

/**
 * Panel shared by login and register. The Figma shows it as a modal over the home page; here it
 * is a real route (/entrar, /cadastro) so direct access, refresh and "return to the previous flow"
 * work — documented as a deliberate deviation in ARCHITECTURE.md.
 */
export function AuthPanel({ mode, redirect, children }: { mode: "login" | "register"; redirect?: string; children: ReactNode }) {
  const navigate = useNavigate();
  return (
    <div className="grid min-h-[calc(100dvh-68px)] place-items-start justify-center px-4 py-10 md:place-items-center md:bg-[radial-gradient(ellipse_at_top,#2f1d15_0%,#140d0a_60%)]">
      <section aria-labelledby="auth-title" className="relative w-full max-w-[500px] md:w-[500px] md:rounded-sm md:border-b-[10px] md:border-copper md:bg-surface-card md:pb-14 md:shadow-card">
        <button
          type="button"
          onClick={() => void navigate({ to: redirect ?? "/" })}
          aria-label="Fechar"
          className="absolute top-3 right-4 hidden text-copper hover:text-copper-light md:block"
        >
          <X className="size-5" aria-hidden />
        </button>
        <p className="mt-6 mb-10 text-center text-[34px] font-bold tracking-[0.1em] md:hidden">KURIO</p>
        <nav aria-label="Acesso" className="flex justify-center gap-2 pt-0 text-xl md:pt-12">
          <h1 id="auth-title" className="sr-only">{mode === "login" ? "Entrar" : "Criar conta"}</h1>
          <Link
            to="/entrar"
            search={{ redirect }}
            aria-current={mode === "login" ? "page" : undefined}
            className={mode === "login" ? "text-copper-light" : "hover:text-copper-light"}
          >
            Entrar
          </Link>
          <span aria-hidden className="text-copper">|</span>
          <Link
            to="/cadastro"
            search={{ redirect }}
            aria-current={mode === "register" ? "page" : undefined}
            className={mode === "register" ? "text-copper-light" : "hover:text-copper-light"}
          >
            Criar conta
          </Link>
        </nav>
        <div className="mx-auto mt-6 w-full max-w-[340px]">{children}</div>
        <div className="mt-6 flex items-center gap-3 text-sm before:h-px before:flex-1 before:bg-line after:h-px after:flex-1 after:bg-line">Ou continue com</div>
        <div className="mx-auto mt-4 flex w-full max-w-[340px] flex-col gap-3">
          {[
            { label: "Google", icon: "/images/brands/google.svg" },
            { label: "Facebook", icon: "/images/brands/facebook.svg" },
          ].map((p) => (
            <button
              key={p.label}
              type="button"
              onClick={() => notAvailable(`Login com ${p.label}`)}
              className="flex h-10 items-center justify-center gap-2 rounded-sm border border-line text-[13px] text-copper-light hover:border-copper"
            >
              <img src={p.icon} alt="" width={20} height={20} /> Continuar com {p.label}
            </button>
          ))}
        </div>
      </section>
    </div>
  );
}

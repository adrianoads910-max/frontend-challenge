import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { z } from "zod";
import { LoginInput } from "@/api/contracts";
import { api } from "@/api/endpoints";
import { useServices } from "@/app/context";
import { Field, FormAlert, PasswordInput, TextInput } from "@/components/form-field";
import { notAvailable } from "@/components/layout/out-of-scope";
import { Button } from "@/components/ui/button";
import { AuthPanel } from "@/features/auth/auth-panel";
import { useZodForm } from "@/hooks/use-zod-form";

export const AuthSearch = z.object({
  /** Where to resume after signing in (only same-origin paths are accepted). */
  redirect: z.string().regex(/^\/(?!\/)/).optional().catch(undefined),
  expired: z.boolean().optional().catch(undefined),
});

export const Route = createFileRoute("/entrar")({
  validateSearch: AuthSearch,
  beforeLoad: ({ context, search }) => {
    if (context.session()) throw redirect({ to: search.redirect ?? "/" });
  },
  head: () => ({ meta: [{ title: "Entrar — Kurio" }] }),
  component: LoginPage,
});

function LoginPage() {
  const { redirect: back, expired } = Route.useSearch();
  const navigate = useNavigate();
  const { lifecycle } = useServices();
  const [submitting, setSubmitting] = useState(false);
  const form = useZodForm(LoginInput, { email: "", password: "" });

  const onSubmit = form.handleSubmit(async (data) => {
    setSubmitting(true);
    try {
      const session = await api.auth.login(data);
      await lifecycle.signIn(session);
      toast.success(`Bem-vindo(a), ${session.user.displayName}!`);
      void navigate({ to: back ?? "/", replace: true });
    } catch (err) {
      form.applyApiError(err);
    } finally {
      setSubmitting(false);
    }
  });

  return (
    <AuthPanel mode="login" redirect={back}>
      <p className="mb-6 text-center text-sm">Entre para gerenciar sua carteira, coleção e perfil de criador.</p>
      {expired && (
        <p role="status" className="mb-4 rounded-md border border-copper/60 bg-copper/10 px-3 py-2 text-sm">
          Sua sessão expirou. Entre novamente para continuar de onde parou.
        </p>
      )}
      <form ref={form.formRef} onSubmit={onSubmit} noValidate className="flex flex-col gap-3">
        <FormAlert message={form.formError} />
        <Field label="E-mail" error={form.errors.email} hideLabel>
          {(a) => <TextInput {...a} {...form.field("email")} type="email" autoComplete="email" placeholder="contato@email.com" />}
        </Field>
        <Field label="Senha" error={form.errors.password} hideLabel>
          {(a) => <PasswordInput {...a} {...form.field("password")} autoComplete="current-password" placeholder="Senha" />}
        </Field>
        <button type="button" onClick={() => notAvailable("Recuperação de senha")} className="self-end text-sm text-copper-light hover:underline">
          Esqueceu a senha?
        </button>
        <Button type="submit" disabled={submitting} className="mt-3 h-11 rounded-sm text-base font-bold">
          {submitting ? "Entrando…" : "Entrar"}
        </Button>
      </form>
    </AuthPanel>
  );
}

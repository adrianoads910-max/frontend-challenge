import { createFileRoute, Link, redirect, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { RegisterForm } from "@/api/contracts";
import { api } from "@/api/endpoints";
import { useServices } from "@/app/context";
import { Field, FormAlert, PasswordInput, TextInput } from "@/components/form-field";
import { Button } from "@/components/ui/button";
import { AuthPanel } from "@/features/auth/auth-panel";
import { useZodForm } from "@/hooks/use-zod-form";
import { AuthSearch } from "./entrar";

export const Route = createFileRoute("/cadastro")({
  validateSearch: AuthSearch,
  beforeLoad: ({ context, search }) => {
    if (context.session()) throw redirect({ to: search.redirect ?? "/" });
  },
  head: () => ({ meta: [{ title: "Criar conta — Kurio" }] }),
  component: RegisterPage,
});

function RegisterPage() {
  const { redirect: back } = Route.useSearch();
  const navigate = useNavigate();
  const { lifecycle } = useServices();
  const [submitting, setSubmitting] = useState(false);
  const form = useZodForm(RegisterForm, { username: "", email: "", password: "", confirmPassword: "" });

  const onSubmit = form.handleSubmit(async ({ confirmPassword: _confirm, ...input }) => {
    setSubmitting(true);
    try {
      const session = await api.auth.register(input);
      await lifecycle.signIn(session);
      toast.success("Perfil de colecionador criado!");
      void navigate({ to: back ?? "/", replace: true });
    } catch (err) {
      // 409 EMAIL_TAKEN / USERNAME_TAKEN and 422 come back as field errors.
      form.applyApiError(err);
    } finally {
      setSubmitting(false);
    }
  });

  return (
    <AuthPanel mode="register" redirect={back}>
      <h2 className="mb-6 text-center text-lg font-bold">Criar perfil de colecionador</h2>
      <form ref={form.ref} onSubmit={onSubmit} noValidate className="flex flex-col gap-3">
        <FormAlert message={form.formError} />
        <Field label="Nome de usuário" error={form.errors.username} hint="Letras minúsculas, números e _" hideLabel>
          {(a) => <TextInput {...a} {...form.field("username")} autoComplete="username" placeholder="Nome de usuário" />}
        </Field>
        <Field label="E-mail" error={form.errors.email} hideLabel>
          {(a) => <TextInput {...a} {...form.field("email")} type="email" autoComplete="email" placeholder="Digite seu e-mail" />}
        </Field>
        <Field label="Senha" error={form.errors.password} hint="Mínimo de 8 caracteres, com letra e número" hideLabel>
          {(a) => <PasswordInput {...a} {...form.field("password")} autoComplete="new-password" placeholder="Senha" />}
        </Field>
        <Field label="Confirmar senha" error={form.errors.confirmPassword} hideLabel>
          {(a) => <PasswordInput {...a} {...form.field("confirmPassword")} autoComplete="new-password" placeholder="Confirmar senha" />}
        </Field>
        <Button type="submit" disabled={submitting} className="mt-4 h-11 rounded-md text-base font-bold">
          {submitting ? "Criando…" : "Criar perfil"}
        </Button>
        <p className="text-center text-sm text-sand md:hidden">
          Já tem uma conta?{" "}
          <Link to="/entrar" search={{ redirect: back }} className="text-copper-light">Entre</Link>
        </p>
      </form>
    </AuthPanel>
  );
}

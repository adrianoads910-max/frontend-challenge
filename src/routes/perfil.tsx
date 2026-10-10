import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { z } from "zod";
import { PasswordChangeInput, ProfileInput, type User } from "@/api/contracts";
import { requireAuth } from "@/app/guards";
import { Field, FormAlert, inputClass, PasswordInput, TextInput } from "@/components/form-field";
import { Icon } from "@/components/icon";
import { UserAvatar } from "@/components/layout/user-avatar";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { AccountLayout } from "@/features/account/account-layout";
import { useChangePassword, useProfile, useRemoveAvatar, useSetAvatar, useUpdateProfile } from "@/hooks/data";
import { useZodForm } from "@/hooks/use-zod-form";
import { ApiError } from "@/lib/http";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/perfil")({
  beforeLoad: requireAuth,
  head: () => ({ meta: [{ title: "Perfil do colecionador — Kurio" }] }),
  component: ProfilePage,
});

/** Profile + optional password change: password fields are validated only when one is filled. */
const ProfileForm = ProfileInput.extend({
  currentPassword: z.string(),
  newPassword: z.string(),
  confirmPassword: z.string(),
}).superRefine((v, ctx) => {
  if (!v.currentPassword && !v.newPassword && !v.confirmPassword) return;
  const parsed = PasswordChangeInput.safeParse(v);
  if (!parsed.success) for (const issue of parsed.error.issues) ctx.addIssue({ ...issue, code: "custom" });
});

function ProfilePage() {
  const { data: user, isPending, isError, refetch } = useProfile();
  return (
    <AccountLayout>
      <h1 className="mb-8 text-lg font-bold">Perfil do colecionador</h1>
      {isPending ? (
        <div className="grid gap-6 md:grid-cols-2" aria-busy="true" aria-label="Carregando perfil">
          {Array.from({ length: 6 }, (_, i) => <Skeleton key={i} className="h-16 w-full" />)}
        </div>
      ) : isError ? (
        <div role="alert" className="space-y-3">
          <p>Não foi possível carregar seu perfil.</p>
          <Button onClick={() => void refetch()}>Tentar novamente</Button>
        </div>
      ) : (
        <ProfileEditor key={user.id} user={user} />
      )}
    </AccountLayout>
  );
}

function ProfileEditor({ user }: { user: User }) {
  const updateProfile = useUpdateProfile();
  const changePassword = useChangePassword();
  const form = useZodForm(ProfileForm, {
    displayName: user.displayName,
    username: user.username,
    email: user.email,
    ensName: user.ensName ?? "",
    walletNickname: user.walletNickname ?? "",
    currentPassword: "",
    newPassword: "",
    confirmPassword: "",
  });
  const saving = updateProfile.isPending || changePassword.isPending;

  const onSubmit = form.handleSubmit(async ({ currentPassword, newPassword, confirmPassword, ...profile }) => {
    try {
      await updateProfile.mutateAsync(profile);
      if (newPassword) {
        await changePassword.mutateAsync({ currentPassword, newPassword, confirmPassword });
        form.set("currentPassword", "");
        form.set("newPassword", "");
        form.set("confirmPassword", "");
        toast.success("Perfil e senha atualizados");
      } else {
        toast.success("Perfil atualizado");
      }
    } catch (err) {
      form.applyApiError(err);
    }
  });

  return (
    <form ref={form.formRef} onSubmit={onSubmit} noValidate className="space-y-8">
      <FormAlert message={form.formError} />
      <div className="grid gap-x-7 gap-y-6 md:grid-cols-2">
        <Field label="Nome de exibição" required error={form.errors.displayName}>
          {(a) => <TextInput {...a} {...form.field("displayName")} autoComplete="name" />}
        </Field>
        <Field label="Nome de usuário" required error={form.errors.username}>
          {(a) => <TextInput {...a} {...form.field("username")} autoComplete="username" />}
        </Field>
        <Field label="E-mail" required error={form.errors.email}>
          {(a) => <TextInput {...a} {...form.field("email")} type="email" autoComplete="email" />}
        </Field>
        <EnsField error={form.errors.ensName} field={form.field("ensName")} />
        <Field label="Apelido da carteira" required error={form.errors.walletNickname}>
          {(a) => <TextInput {...a} {...form.field("walletNickname")} />}
        </Field>
        <AvatarEditor user={user} />
      </div>

      <fieldset className="max-w-[417px] space-y-5">
        <legend className="mb-5 text-lg font-bold">Alterar senha</legend>
        <Field label="Senha atual" error={form.errors.currentPassword}>
          {(a) => <PasswordInput {...a} {...form.field("currentPassword")} autoComplete="current-password" />}
        </Field>
        <Field label="Nova senha" error={form.errors.newPassword} hint="Deixe em branco para manter a senha atual">
          {(a) => <PasswordInput {...a} {...form.field("newPassword")} autoComplete="new-password" />}
        </Field>
        <Field label="Confirmar nova senha" error={form.errors.confirmPassword}>
          {(a) => <PasswordInput {...a} {...form.field("confirmPassword")} autoComplete="new-password" />}
        </Field>
      </fieldset>

      <Button type="submit" disabled={saving} className="h-10 w-[131px] rounded-sm font-bold">{saving ? "Salvando…" : "Salvar"}</Button>
    </form>
  );
}

/** "Nome ENS": fixed ".eth" suffix select + name input (layout of the Figma). */
export function EnsField({ error, field }: { error?: string; field: { name: string; value: string; onChange: (e: { target: { value: string } }) => void; onBlur: () => void } }) {
  return (
    <Field label="Nome ENS" required error={error}>
      {(a) => (
        <div className="flex gap-2.5">
          <select aria-label="Domínio ENS" className={cn(inputClass, "w-[78px] shrink-0 px-2")} defaultValue=".eth">
            <option value=".eth">.eth</option>
          </select>
          <TextInput {...a} {...field} autoComplete="off" spellCheck={false} />
        </div>
      )}
    </Field>
  );
}

/** Resizes the picked image to ≤256px on a canvas before uploading (keeps the payload small). */
async function toAvatarDataUrl(file: File): Promise<string> {
  if (!/^image\/(png|jpeg|webp)$/.test(file.type)) throw new Error("Use uma imagem PNG, JPEG ou WebP.");
  if (file.size > 8 * 1024 * 1024) throw new Error("A imagem deve ter no máximo 8 MB.");
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, 256 / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/webp", 0.85);
}

function AvatarEditor({ user }: { user: User }) {
  const setAvatar = useSetAvatar();
  const removeAvatar = useRemoveAvatar();
  const input = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const busy = setAvatar.isPending || removeAvatar.isPending;
  useEffect(() => setError(null), [user.avatarUrl]);

  return (
    <div className="flex flex-col gap-2">
      <span id="avatar-label" className="text-[15px]">Avatar</span>
      <div className="flex items-center gap-6" role="group" aria-labelledby="avatar-label">
        {user.avatarUrl ? (
          <UserAvatar user={user} className="size-[50px]" />
        ) : (
          <span className="grid size-[50px] place-items-center rounded-full border border-line bg-surface-card text-copper" aria-label="Sem avatar">
            <Icon name="image-2" />
          </span>
        )}
        <input
          ref={input}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          className="sr-only"
          tabIndex={-1}
          aria-hidden
          onChange={async (e) => {
            const file = e.target.files?.[0];
            e.target.value = "";
            if (!file) return;
            try {
              const dataUrl = await toAvatarDataUrl(file);
              await setAvatar.mutateAsync(dataUrl);
              toast.success("Avatar atualizado");
            } catch (err) {
              setError(err instanceof ApiError || err instanceof Error ? err.message : "Não foi possível enviar a imagem.");
            }
          }}
        />
        <Button type="button" onClick={() => input.current?.click()} disabled={busy} className="h-10 rounded-sm px-6 font-bold">
          {setAvatar.isPending ? "Enviando…" : "Alterar"}
        </Button>
        <button
          type="button"
          disabled={busy || !user.avatarUrl}
          onClick={() => removeAvatar.mutate(undefined, { onSuccess: () => toast.success("Avatar removido") })}
          className="text-[15px] hover:text-copper-light disabled:opacity-50"
        >
          Remover
        </button>
      </div>
      {error && <p role="alert" className="text-xs text-coral">{error}</p>}
    </div>
  );
}

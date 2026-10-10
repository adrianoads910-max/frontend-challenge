import { useEffect } from "react";
import { NETWORKS, type Wallet, WALLET_PROVIDERS, WalletInput } from "@/api/contracts";
import { Field, FormAlert, inputClass, TextInput } from "@/components/form-field";
import { Button } from "@/components/ui/button";
import { useZodForm } from "@/hooks/use-zod-form";
import { NETWORK_LABELS, PROVIDER_LABELS } from "@/lib/labels";
import { cn } from "@/lib/utils";
import { EnsField } from "@/routes/perfil";

export type WalletDraft = {
  displayName: string;
  nickname: string;
  network: string;
  profileName: string;
  address: string;
  secondaryAddress: string;
  provider: string;
  referralCode: string;
  email: string;
  ensName: string;
};

export const emptyWallet: WalletDraft = {
  displayName: "",
  nickname: "",
  network: "",
  profileName: "",
  address: "",
  secondaryAddress: "",
  provider: "",
  referralCode: "",
  email: "",
  ensName: "",
};

export const walletToDraft = (w: Wallet): WalletDraft => ({ ...w, secondaryAddress: w.secondaryAddress ?? "" });

/** Wallet form of the Figma (primary/secondary wallets). Server field errors land on the inputs. */
export function WalletForm({
  initial,
  onSubmit,
  submitting,
  submitLabel = "Salvar carteira",
  idPrefix,
}: {
  initial: WalletDraft;
  onSubmit: (input: WalletInput) => Promise<void>;
  submitting: boolean;
  submitLabel?: string;
  idPrefix: string;
}) {
  const form = useZodForm(WalletInput, initial as unknown as WalletInput);
  useEffect(() => {
    form.reset(initial as unknown as WalletInput);
    form.setErrors({});
  }, [initial]); // eslint-disable-line react-hooks/exhaustive-deps

  const submit = form.handleSubmit(async (data) => {
    try {
      await onSubmit(data);
    } catch (err) {
      form.applyApiError(err);
    }
  });

  const select = (name: "network" | "provider", options: readonly string[], labels: Record<string, string>, placeholder: string) => (a: object) => (
    <select {...a} {...form.field(name)} className={cn(inputClass, "pr-8")}>
      <option value="" disabled>{placeholder}</option>
      {options.map((o) => <option key={o} value={o}>{labels[o]}</option>)}
    </select>
  );

  return (
    <form ref={form.ref} onSubmit={submit} noValidate className="space-y-6" id={`${idPrefix}-form`}>
      <FormAlert message={form.formError} />
      <div className="grid gap-x-7 gap-y-5 md:grid-cols-2">
        <Field label="Nome de exibição" required error={form.errors.displayName}>
          {(a) => <TextInput {...a} {...form.field("displayName")} autoComplete="name" />}
        </Field>
        <Field label="Apelido da carteira" required error={form.errors.nickname}>
          {(a) => <TextInput {...a} {...form.field("nickname")} />}
        </Field>
        <Field label="Rede" required error={form.errors.network}>
          {select("network", NETWORKS, NETWORK_LABELS, "Selecione uma rede")}
        </Field>
        <Field label="Nome do perfil" required error={form.errors.profileName}>
          {(a) => <TextInput {...a} {...form.field("profileName")} />}
        </Field>
        <Field label="Endereço da carteira" required error={form.errors.address}>
          {(a) => <TextInput {...a} {...form.field("address")} placeholder="Endereço 0x da carteira" spellCheck={false} autoComplete="off" />}
        </Field>
        <Field label="ENS ou carteira secundária (opcional)" error={form.errors.secondaryAddress} className="md:justify-end" hideLabel>
          {(a) => <TextInput {...a} {...form.field("secondaryAddress")} placeholder="ENS ou carteira secundária (opcional)" spellCheck={false} autoComplete="off" />}
        </Field>
        <Field label="Tipo de carteira" required error={form.errors.provider}>
          {select("provider", WALLET_PROVIDERS, PROVIDER_LABELS, "Selecione uma carteira")}
        </Field>
        <Field label="Código de indicação" required error={form.errors.referralCode}>
          {(a) => <TextInput {...a} {...form.field("referralCode")} autoComplete="off" onChange={(e) => form.set("referralCode", e.target.value.toUpperCase())} />}
        </Field>
        <Field label="E-mail" required error={form.errors.email}>
          {(a) => <TextInput {...a} {...form.field("email")} type="email" autoComplete="email" />}
        </Field>
        <EnsField error={form.errors.ensName} field={form.field("ensName")} />
      </div>
      <Button type="submit" disabled={submitting} className="h-10 rounded-sm px-3 font-bold">
        {submitting ? "Salvando…" : submitLabel}
      </Button>
    </form>
  );
}

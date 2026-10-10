import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import type { Wallet, WalletRole } from "@/api/contracts";
import { requireAuth } from "@/app/guards";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { AccountLayout } from "@/features/account/account-layout";
import { emptyWallet, WalletForm, walletToDraft, type WalletDraft } from "@/features/account/wallet-form";
import { useSaveWallet, useWallets } from "@/hooks/data";
import { NETWORK_LABELS, PROVIDER_LABELS } from "@/lib/labels";

export const Route = createFileRoute("/carteiras")({
  beforeLoad: requireAuth,
  head: () => ({ meta: [{ title: "Carteiras — Kurio" }] }),
  component: WalletsPage,
});

function WalletsPage() {
  const { data: wallets, isPending, isError, refetch } = useWallets();
  return (
    <AccountLayout>
      {isPending ? (
        <div className="space-y-4" aria-busy="true" aria-label="Carregando carteiras">
          {Array.from({ length: 5 }, (_, i) => <Skeleton key={i} className="h-16 w-full" />)}
        </div>
      ) : isError ? (
        <div role="alert" className="space-y-3">
          <p>Não foi possível carregar suas carteiras.</p>
          <Button onClick={() => void refetch()}>Tentar novamente</Button>
        </div>
      ) : (
        <Wallets wallets={wallets} />
      )}
    </AccountLayout>
  );
}

function Wallets({ wallets }: { wallets: Wallet[] }) {
  const primary = wallets.find((w) => w.role === "primary");
  const secondary = wallets.find((w) => w.role === "secondary");
  const [editingPrimary, setEditingPrimary] = useState(!primary);
  const [addingSecondary, setAddingSecondary] = useState(false);
  const [sameAsPrimary, setSameAsPrimary] = useState(false);
  const save = useSaveWallet();

  const persist = (role: WalletRole, existing?: Wallet) => async (input: Parameters<typeof save.mutateAsync>[0]["input"]) => {
    await save.mutateAsync({ id: existing?.id, role, input });
    toast.success(role === "primary" ? "Carteira principal salva" : "Carteira secundária salva");
    if (role === "primary") setEditingPrimary(false);
    else setAddingSecondary(false);
  };

  const secondaryInitial = useMemo<WalletDraft>(() => {
    if (secondary) return walletToDraft(secondary);
    if (sameAsPrimary && primary) return { ...walletToDraft(primary), address: "", nickname: "", secondaryAddress: "" };
    return emptyWallet;
  }, [secondary, sameAsPrimary, primary]);
  const primaryInitial = useMemo(() => (primary ? walletToDraft(primary) : emptyWallet), [primary]);

  return (
    <div className="space-y-12">
      <section aria-labelledby="primary-title" className="space-y-6">
        <header className="flex items-start justify-between gap-4">
          <div>
            <h1 id="primary-title" className="text-lg font-bold">Carteira principal</h1>
            <p className="text-sm text-copper-light">Estas carteiras ficam disponíveis no pagamento e para receber NFTs comprados.</p>
          </div>
          {primary && !editingPrimary && (
            <button type="button" onClick={() => setEditingPrimary(true)} className="text-[17px] font-bold text-copper-light hover:underline">Editar</button>
          )}
        </header>
        {primary && !editingPrimary ? (
          <WalletSummary wallet={primary} />
        ) : (
          <WalletForm idPrefix="primary" initial={primaryInitial} onSubmit={persist("primary", primary)} submitting={save.isPending} />
        )}
      </section>

      <section aria-labelledby="secondary-title" className="space-y-6">
        <header className="flex flex-wrap items-center justify-between gap-4">
          <h2 id="secondary-title" className="text-lg font-bold">Carteira secundária</h2>
          <div className="flex items-center gap-4">
            {!secondary && primary && (
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={sameAsPrimary} onChange={(e) => setSameAsPrimary(e.target.checked)} className="size-4 accent-copper" />
                Igual à carteira principal
              </label>
            )}
            {!addingSecondary && (
              <button
                type="button"
                disabled={!primary}
                onClick={() => setAddingSecondary(true)}
                className="text-[17px] font-bold text-copper-light hover:underline disabled:opacity-50"
                aria-describedby={!primary ? "secondary-help" : undefined}
              >
                {secondary ? "Editar" : "Adicionar"}
              </button>
            )}
          </div>
        </header>
        {addingSecondary ? (
          <WalletForm idPrefix="secondary" initial={secondaryInitial} onSubmit={persist("secondary", secondary)} submitting={save.isPending} />
        ) : secondary ? (
          <WalletSummary wallet={secondary} />
        ) : (
          <p id="secondary-help" className="text-sm text-copper-light">
            {primary ? "Você ainda não adicionou uma carteira secundária." : "Cadastre a carteira principal antes da secundária."}
          </p>
        )}
      </section>
    </div>
  );
}

function WalletSummary({ wallet }: { wallet: Wallet }) {
  return (
    <dl className="grid gap-4 rounded-md border border-line bg-surface-card p-5 text-sm md:grid-cols-2">
      {[
        ["Apelido", wallet.nickname],
        ["Rede", NETWORK_LABELS[wallet.network]],
        ["Tipo", PROVIDER_LABELS[wallet.provider]],
        ["Endereço", wallet.address],
        ["Nome ENS", `${wallet.ensName}.eth`],
        ["E-mail", wallet.email],
      ].map(([label, value]) => (
        <div key={label} className="min-w-0">
          <dt className="text-sand">{label}</dt>
          <dd className="truncate font-bold" title={value}>{value}</dd>
        </div>
      ))}
    </dl>
  );
}

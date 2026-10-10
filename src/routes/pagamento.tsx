import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { z } from "zod";
import { CollectorInput, Network, type Quote, Quote as QuoteSchema, type User, type Wallet, type WalletConnection } from "@/api/contracts";
import { requireAuth } from "@/app/guards";
import { Field, FormAlert, inputClass, TextInput } from "@/components/form-field";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { useCreateOrder, useOrderSubmitting, usePendingOrders, useQuote } from "@/features/checkout/orders";
import { useCart, useConnectWallet, useProfile, useWallets } from "@/hooks/data";
import { useZodForm } from "@/hooks/use-zod-form";
import { eth } from "@/lib/eth";
import { ApiError } from "@/lib/http";
import { artworkUrl } from "@/lib/images";
import { NETWORK_LABELS, PROVIDER_LABELS } from "@/lib/labels";
import { useSession } from "@/lib/session";
import { cn } from "@/lib/utils";
import { CouponForm, Totals } from "./carrinho";

export const Route = createFileRoute("/pagamento")({
  beforeLoad: requireAuth,
  head: () => ({ meta: [{ title: "Pagamento — Kurio" }] }),
  component: CheckoutPage,
});

const CheckoutForm = CollectorInput.extend({ network: Network });
type CheckoutDraft = z.input<typeof CheckoutForm>;

/** The form survives a session expiry: it is restored after signing in again. */
const draftKey = (userId: string) => `kurio.checkout.draft.${userId}`;
function loadDraft(userId: string): Partial<CheckoutDraft> {
  try {
    return JSON.parse(sessionStorage.getItem(draftKey(userId)) ?? "{}") as Partial<CheckoutDraft>;
  } catch {
    return {};
  }
}

function CheckoutPage() {
  const cart = useCart();
  const wallets = useWallets();
  const profile = useProfile();
  const pending = usePendingOrders();
  const submitting = useOrderSubmitting();

  const loading = cart.isPending || wallets.isPending || profile.isPending;
  return (
    <div className="pb-10">
      <nav aria-label="Trilha" className="container-page hidden pt-7 pb-6 text-sm font-bold md:block">
        <ol className="flex gap-2">
          <li><Link to="/" className="hover:text-copper-light">Início</Link> /</li>
          <li><Link to="/" hash="catalogo" className="hover:text-copper-light">Mercado</Link> /</li>
          <li aria-current="page">Pagamento</li>
        </ol>
      </nav>
      <h1 className="container-page pt-6 pb-4 text-xl font-bold md:sr-only">Pagamento</h1>
      {pending.data?.[0] && <PendingOrderBanner orderId={pending.data[0].id} />}
      {loading ? (
        <CheckoutSkeleton />
      ) : cart.isError || wallets.isError || profile.isError ? (
        <div role="alert" className="container-page space-y-3 py-10 text-center">
          <p>Não foi possível carregar os dados do pagamento.</p>
          <Button onClick={() => void Promise.all([cart.refetch(), wallets.refetch(), profile.refetch()])}>Tentar novamente</Button>
        </div>
      ) : !cart.data?.items.length && !submitting ? (
        <div role="status" className="container-page py-16 text-center">
          <p className="font-bold">Seu carrinho está vazio.</p>
          <Link to="/" hash="catalogo" className="mt-3 inline-block text-copper-light hover:underline">Explorar NFTs</Link>
        </div>
      ) : !wallets.data?.length ? (
        <div role="status" className="container-page py-16 text-center">
          <p className="font-bold">Cadastre uma carteira para finalizar a compra.</p>
          <p className="mt-1 text-sm text-sand">As carteiras cadastradas ficam disponíveis no pagamento e recebem os NFTs comprados.</p>
          <Link to="/carteiras" className="mt-4 inline-block rounded-md bg-copper px-5 py-2 font-bold text-ink hover:bg-copper-light">Cadastrar carteira</Link>
        </div>
      ) : (
        <Checkout user={profile.data!} wallets={wallets.data} blockedByPending={Boolean(pending.data?.length)} />
      )}
    </div>
  );
}

function PendingOrderBanner({ orderId }: { orderId: string }) {
  return (
    <div role="status" className="container-page mb-6">
      <p className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-copper bg-copper/10 p-3 text-sm">
        Você tem um pedido em processamento. Aguarde a confirmação antes de iniciar outra compra.
        <Link to="/pedido/$orderId" params={{ orderId }} className="font-bold text-copper-light hover:underline">Acompanhar pedido</Link>
      </p>
    </div>
  );
}

type Connection = { status: "idle" } | { status: "connecting" } | { status: "connected"; connection: WalletConnection } | { status: "rejected"; message: string };

function Checkout({ user, wallets, blockedByPending }: { user: User; wallets: Wallet[]; blockedByPending: boolean }) {
  const navigate = useNavigate();
  const session = useSession()!;
  const cart = useCart().data!;
  const primary = wallets.find((w) => w.role === "primary") ?? wallets[0]!;
  const secondary = wallets.find((w) => w.role === "secondary");
  const [useOther, setUseOther] = useState(false);
  const [walletId, setWalletId] = useState(primary.id);
  const wallet = wallets.find((w) => w.id === walletId) ?? primary;
  const [connection, setConnection] = useState<Connection>({ status: "idle" });
  const connect = useConnectWallet();
  const quote = useQuote();
  const createOrder = useCreateOrder();
  const [review, setReview] = useState<Quote | null>(null);
  const [staleNotice, setStaleNotice] = useState<string | null>(null);

  const form = useZodForm(CheckoutForm, {
    displayName: user.displayName,
    username: user.username,
    profileName: primary.profileName,
    email: user.email,
    ensName: user.ensName ?? primary.ensName,
    referralCode: primary.referralCode,
    note: "",
    network: primary.network,
    ...loadDraft(session.user.id),
  });

  // Persist the draft (restored if the session expires mid-checkout).
  useEffect(() => {
    sessionStorage.setItem(draftKey(session.user.id), JSON.stringify(form.values));
  }, [form.values, session.user.id]);

  // Switching wallet drops the connection and adopts that wallet's network/profile data.
  const selectWallet = (w: Wallet) => {
    setWalletId(w.id);
    setConnection({ status: "idle" });
    form.set("network", w.network);
    form.set("profileName", w.profileName);
    form.set("referralCode", w.referralCode);
  };

  const network = Network.safeParse(form.values.network).success ? (form.values.network as Network) : wallet.network;

  // Realtime: if the cart changes while reviewing (nft.updated → cart refetch), the quote is stale.
  const reviewStale = review !== null && cart.version !== review.cartVersion;

  const doConnect = () => {
    setConnection({ status: "connecting" });
    connect.mutate(
      { walletId: wallet.id, network },
      {
        onSuccess: (c) => {
          setConnection({ status: "connected", connection: c });
          toast.success(`${PROVIDER_LABELS[c.provider]} conectada`);
        },
        onError: (err) => setConnection({ status: "rejected", message: err instanceof ApiError ? err.message : "Conexão recusada." }),
      },
    );
  };

  const openReview = form.handleSubmit(async (data) => {
    if (connection.status !== "connected" || connection.connection.network !== data.network) {
      form.setFormError("Conecte a carteira na rede selecionada antes de confirmar a compra.");
      document.getElementById("wallet-connect")?.focus();
      return;
    }
    setStaleNotice(null);
    try {
      setReview(await quote.mutateAsync(data.network));
    } catch (err) {
      form.applyApiError(err);
    }
  });

  const refreshQuote = async () => {
    try {
      const fresh = await quote.mutateAsync(network);
      if (review && !eth.eq(review.total, fresh.total)) {
        setStaleNotice(`O total mudou de ${eth.format(review.total)} ETH para ${eth.format(fresh.total)} ETH.`);
      }
      setReview(fresh);
    } catch (err) {
      setReview(null);
      toast.error(err instanceof ApiError ? err.message : "Não foi possível atualizar a cotação.");
    }
  };

  const confirm = () => {
    if (!review) return;
    const { network: net, ...collector } = form.values as z.output<typeof CheckoutForm>;
    createOrder.mutate(
      { quoteId: review.id, walletId: wallet.id, network: net, collector: CollectorInput.parse(collector) },
      {
        // Navigation to the order happens in useCreateOrder (works even if this view unmounts).
        onSuccess: () => setReview(null),
        onError: (err) => {
          if (err instanceof ApiError && err.code === "QUOTE_STALE") {
            const fresh = QuoteSchema.safeParse((err.details as { quote?: unknown } | undefined)?.quote);
            if (fresh.success) {
              setStaleNotice(`Os valores mudaram: o total passou de ${eth.format(review.total)} ETH para ${eth.format(fresh.data.total)} ETH. Revise e confirme novamente.`);
              setReview(fresh.data);
              return;
            }
          }
          if (err instanceof ApiError && (err.code === "OUT_OF_STOCK" || err.code === "EDITION_UNAVAILABLE")) {
            setReview(null);
            toast.error(err.message, { description: "Ajuste o carrinho para continuar." });
            void navigate({ to: "/carrinho" });
            return;
          }
          toast.error(err instanceof ApiError ? err.message : "Não foi possível enviar o pedido.", {
            description: "Seus itens continuam no carrinho. Você pode tentar novamente com segurança.",
          });
        },
      },
    );
  };

  const summary = review ?? cart;
  return (
    <div className="container-page grid gap-10 lg:grid-cols-[minmax(0,763px)_405px] lg:justify-between">
      <form ref={form.formRef} onSubmit={openReview} noValidate aria-labelledby="collector-title" className="space-y-6">
        <h2 id="collector-title" className="text-lg font-bold">Perfil do colecionador</h2>
        <FormAlert message={form.formError} />
        <div className="grid gap-x-6 gap-y-5 md:grid-cols-2">
          <Field label="Nome de exibição" required error={form.errors.displayName}>
            {(a) => <TextInput {...a} {...form.field("displayName")} autoComplete="name" />}
          </Field>
          <Field label="Nome de usuário" required error={form.errors.username}>
            {(a) => <TextInput {...a} {...form.field("username")} autoComplete="username" />}
          </Field>
          <Field label="Rede" required error={form.errors.network}>
            {(a) => (
              <select
                {...a}
                {...form.field("network")}
                onChange={(e) => {
                  form.set("network", e.target.value as Network);
                  setConnection({ status: "idle" }); // a different network needs a new connection
                }}
                className={inputClass}
              >
                {(["ethereum", "polygon", "solana"] as const).map((n) => <option key={n} value={n}>{NETWORK_LABELS[n]}</option>)}
              </select>
            )}
          </Field>
          <Field label="Nome do perfil" required error={form.errors.profileName}>
            {(a) => <TextInput {...a} {...form.field("profileName")} />}
          </Field>
          <Field label="Endereço da carteira" required hint="Definido pela carteira selecionada">
            {(a) => <TextInput {...a} value={wallet.address} readOnly className="text-sand" />}
          </Field>
          <Field label="ENS ou carteira secundária (opcional)" hideLabel className="md:justify-end">
            {(a) => <TextInput {...a} value={wallet.secondaryAddress ?? ""} readOnly placeholder="ENS ou carteira secundária (opcional)" className="text-sand" />}
          </Field>
          <Field label="Tipo de carteira" required>
            {(a) => <TextInput {...a} value={PROVIDER_LABELS[wallet.provider]} readOnly className="text-sand" />}
          </Field>
          <Field label="Código de indicação" required error={form.errors.referralCode}>
            {(a) => <TextInput {...a} {...form.field("referralCode")} onChange={(e) => form.set("referralCode", e.target.value.toUpperCase())} />}
          </Field>
          <Field label="E-mail" required error={form.errors.email}>
            {(a) => <TextInput {...a} {...form.field("email")} type="email" autoComplete="email" />}
          </Field>
          <Field label="Nome ENS" required error={form.errors.ensName}>
            {(a) => (
              <div className="flex gap-2.5">
                <span className="grid h-10 w-[78px] shrink-0 place-items-center rounded-sm border border-line-soft text-sm">.eth</span>
                <TextInput {...a} {...form.field("ensName")} spellCheck={false} />
              </div>
            )}
          </Field>
        </div>
        {secondary && (
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={useOther}
              onChange={(e) => {
                setUseOther(e.target.checked);
                selectWallet(e.target.checked ? secondary : primary);
              }}
              className="size-4 accent-copper"
            />
            Usar outra carteira? ({secondary.nickname})
          </label>
        )}
        <Field label="Observação do colecionador (opcional)" error={form.errors.note} className="max-w-[350px]">
          {(a) => <textarea {...a} {...form.field("note")} rows={6} className={cn(inputClass, "h-auto py-2")} maxLength={280} />}
        </Field>
      </form>

      <aside aria-labelledby="summary-title" className="space-y-5">
        <h2 id="summary-title" className="text-lg font-bold">Seus NFTs</h2>
        <ul className="space-y-3">
          {cart.items.map((item) => (
            <li key={item.id} className="flex items-center gap-3 rounded-md bg-surface-card p-1">
              <img src={artworkUrl(item.image, 256)} alt="" width={66} height={66} className="size-[66px] rounded-md object-cover" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-[15px] font-bold">{item.name}</p>
                <p className="text-sm text-sand">ID do token: {item.tokenId}</p>
              </div>
              <span className="text-sm text-sand">(x {item.quantity})</span>
              <span className="pr-3 text-[17px] font-bold whitespace-nowrap text-copper-light">{eth.format(item.lineTotal)} ETH</span>
            </li>
          ))}
        </ul>
        <CouponForm cart={cart} />
        <div aria-live="polite">
          <Totals subtotal={summary.subtotal} discount={summary.discount} networkFee={review?.networkFee ?? cart.networkFee} total={review?.total ?? cart.total} />
          {!review && network !== "ethereum" && <p className="mt-1 text-right text-xs text-sand">A taxa da rede {NETWORK_LABELS[network]} é calculada na revisão.</p>}
        </div>

        <fieldset className="space-y-3">
          <legend className="mb-3 w-full text-center text-[17px] font-bold">Carteira e rede</legend>
          {wallets.map((w) => (
            <label key={w.id} className={cn("flex cursor-pointer items-center gap-3 rounded-sm border px-4 py-3 text-[15px]", w.id === walletId ? "border-cream" : "border-line")}>
              <input type="radio" name="wallet" checked={w.id === walletId} onChange={() => selectWallet(w)} className="size-4 accent-copper" />
              <span className="flex-1">{PROVIDER_LABELS[w.provider]} <span className="text-xs text-sand">— {w.nickname} · {NETWORK_LABELS[w.network]}</span></span>
            </label>
          ))}
          <WalletConnectionStatus connection={connection} network={network} onConnect={doConnect} onDisconnect={() => setConnection({ status: "idle" })} />
        </fieldset>

        <Button
          type="button"
          onClick={() => form.formRef.current?.requestSubmit()}
          disabled={quote.isPending || blockedByPending}
          className="h-11 w-full rounded-sm text-[15px] font-bold"
        >
          {quote.isPending ? "Calculando…" : "Confirmar compra"}
        </Button>
        {blockedByPending && <p className="text-center text-xs text-sand">Há um pedido em processamento.</p>}
      </aside>

      <ReviewDialog
        quote={review}
        wallet={wallet}
        stale={reviewStale}
        staleNotice={staleNotice}
        submitting={createOrder.isPending}
        refreshing={quote.isPending}
        onRefresh={refreshQuote}
        onConfirm={confirm}
        onClose={() => {
          if (!createOrder.isPending) setReview(null);
        }}
      />
    </div>
  );
}

function WalletConnectionStatus({ connection, network, onConnect, onDisconnect }: { connection: Connection; network: Network; onConnect: () => void; onDisconnect: () => void }) {
  return (
    <div className="rounded-sm border border-dashed border-line p-3 text-sm" aria-live="polite">
      {connection.status === "connected" ? (
        <div className="flex items-center justify-between gap-3">
          <span>
            <span className="mr-2 inline-block size-2 rounded-full bg-mint" aria-hidden />
            Conectada na {NETWORK_LABELS[connection.connection.network]} · {connection.connection.address.slice(0, 6)}…{connection.connection.address.slice(-4)}
          </span>
          <button type="button" onClick={onDisconnect} className="text-copper-light hover:underline">Desconectar</button>
        </div>
      ) : (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <span className={connection.status === "rejected" ? "text-coral" : "text-sand"}>
            {connection.status === "connecting"
              ? "Aguardando aprovação na carteira…"
              : connection.status === "rejected"
                ? connection.message
                : `Carteira desconectada (${NETWORK_LABELS[network]})`}
          </span>
          <Button id="wallet-connect" type="button" size="sm" variant="outline" onClick={onConnect} disabled={connection.status === "connecting"}>
            {connection.status === "rejected" ? "Tentar novamente" : "Conectar carteira"}
          </Button>
        </div>
      )}
    </div>
  );
}

function ReviewDialog({
  quote,
  wallet,
  stale,
  staleNotice,
  submitting,
  refreshing,
  onRefresh,
  onConfirm,
  onClose,
}: {
  quote: Quote | null;
  wallet: Wallet;
  stale: boolean;
  staleNotice: string | null;
  submitting: boolean;
  refreshing: boolean;
  onRefresh: () => void;
  onConfirm: () => void;
  onClose: () => void;
}) {
  const expiresAt = useMemo(() => (quote ? new Date(quote.expiresAt) : null), [quote]);
  return (
    <Dialog open={quote !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-[560px]">
        <DialogHeader>
          <DialogTitle>Revise sua compra</DialogTitle>
          <DialogDescription>
            Valores cotados pelo servidor{expiresAt ? `, válidos até ${expiresAt.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}` : ""}.
          </DialogDescription>
        </DialogHeader>
        {quote && (
          <div className="space-y-4">
            {(stale || staleNotice) && (
              <div role="alert" className="rounded-md border border-copper bg-copper/10 p-3 text-sm">
                {stale ? "O preço ou a disponibilidade de um item mudou enquanto você revisava. Atualize a cotação antes de confirmar." : staleNotice}
                {stale && (
                  <Button size="sm" variant="outline" className="mt-2" onClick={onRefresh} disabled={refreshing}>
                    {refreshing ? "Atualizando…" : "Atualizar cotação"}
                  </Button>
                )}
              </div>
            )}
            <ul className="space-y-2">
              {quote.lines.map((l) => (
                <li key={l.editionId} className="flex items-center gap-3 text-sm">
                  <img src={artworkUrl(l.image, 256)} alt="" width={44} height={44} className="size-11 rounded-md object-cover" />
                  <span className="flex-1">{l.name} <span className="text-sand">· {l.editionLabel} · x{l.quantity}</span></span>
                  <span className="font-bold text-copper-light">{eth.format(l.lineTotal)} ETH</span>
                </li>
              ))}
            </ul>
            <Totals {...quote} />
            <p className="text-sm text-sand">
              Pagamento com {PROVIDER_LABELS[wallet.provider]} ({wallet.nickname}) na {NETWORK_LABELS[quote.network]}.
            </p>
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={submitting}>Editar dados</Button>
          <Button onClick={onConfirm} disabled={submitting || stale} className="font-bold">
            {submitting ? "Enviando pedido…" : "Confirmar e pagar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function CheckoutSkeleton() {
  return (
    <div className="container-page grid gap-10 lg:grid-cols-[1fr_405px]" aria-busy="true" aria-label="Carregando pagamento">
      <div className="grid gap-5 md:grid-cols-2">{Array.from({ length: 10 }, (_, i) => <Skeleton key={i} className="h-16 w-full" />)}</div>
      <div className="space-y-3">{Array.from({ length: 6 }, (_, i) => <Skeleton key={i} className="h-12 w-full" />)}</div>
    </div>
  );
}

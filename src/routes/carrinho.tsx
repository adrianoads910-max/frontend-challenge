import { createFileRoute, Link, useNavigate, useRouter } from "@tanstack/react-router";
import { useId, useState, type FormEvent } from "react";
import { toast } from "sonner";
import type { Cart, CartItem } from "@/api/contracts";
import { Icon } from "@/components/icon";
import { QuantityStepper } from "@/components/quantity-stepper";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { NftCard } from "@/features/catalog/nft-card";
import {
  useAcknowledgePrices,
  useApplyCoupon,
  useCart,
  useCatalog,
  useRemoveCartItem,
  useRemoveCoupon,
  useUpdateCartItem,
} from "@/hooks/data";
import { eth } from "@/lib/eth";
import { ApiError } from "@/lib/http";
import { artworkUrl } from "@/lib/images";
import { useSession } from "@/lib/session";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/carrinho")({
  head: () => ({ meta: [{ title: "Carrinho de NFTs — Kurio" }] }),
  component: CartPage,
});

/** Items with these statuses must be fixed before checkout. */
const BLOCKING = new Set<CartItem["status"]>(["sold-out", "insufficient-stock"]);

function CartPage() {
  const { data: cart, isPending, isError, error, refetch, isFetching } = useCart();
  const router = useRouter();

  return (
    <div className="pb-8 md:pb-0">
      <div className="container-page flex items-center justify-center pt-6 md:hidden">
        <button type="button" onClick={() => router.history.back()} aria-label="Voltar" className="absolute left-4 grid size-[34px] place-items-center rounded-full border border-line">
          <Icon name="arrow-left-2" size={18} />
        </button>
        <h1 className="text-xl font-bold">Carrinho de NFTs</h1>
      </div>
      <nav aria-label="Trilha" className="container-page hidden pt-7 pb-3 text-sm font-bold md:block">
        <ol className="flex gap-2">
          <li><Link to="/" className="hover:text-copper-light">Início</Link> /</li>
          <li><Link to="/" hash="catalogo" className="hover:text-copper-light">Mercado</Link> /</li>
          <li aria-current="page">Carrinho</li>
        </ol>
      </nav>
      <h1 className="sr-only md:not-sr-only md:hidden">Carrinho de NFTs</h1>

      <div className="container-page mt-4 grid gap-10 md:mt-0 lg:grid-cols-[minmax(0,782px)_332px] lg:justify-between">
        <section aria-labelledby="cart-items-title" className="min-w-0">
          <h2 id="cart-items-title" className="sr-only">Itens do carrinho</h2>
          {isPending ? (
            <ItemsSkeleton />
          ) : isError ? (
            <div role="alert" className="rounded-md border border-line bg-surface-card p-8 text-center">
              <p className="font-bold">Não foi possível carregar seu carrinho.</p>
              <p className="mt-1 text-sm text-sand">{error instanceof ApiError ? error.message : ""}</p>
              <Button className="mt-4" onClick={() => void refetch()} disabled={isFetching}>{isFetching ? "Tentando…" : "Tentar novamente"}</Button>
            </div>
          ) : cart.items.length === 0 ? (
            <EmptyCart />
          ) : (
            <CartItems cart={cart} />
          )}
        </section>
        <CartSummary cart={cart} loading={isPending} />
      </div>
      <AlsoViewed />
    </div>
  );
}

function EmptyCart() {
  return (
    <div role="status" className="rounded-md border border-dashed border-line p-10 text-center">
      <p className="font-bold">Seu carrinho está vazio.</p>
      <p className="mt-1 text-sm text-sand">Explore o mercado e escolha uma edição para colecionar.</p>
      <Link to="/" hash="catalogo" className="mt-4 inline-block rounded-md bg-copper px-5 py-2 font-bold text-ink hover:bg-copper-light">Explorar NFTs</Link>
    </div>
  );
}

function CartItems({ cart }: { cart: Cart }) {
  const acknowledge = useAcknowledgePrices();
  const changed = cart.items.filter((i) => i.status === "price-changed");
  return (
    <>
      {changed.length > 0 && (
        <div role="status" className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-md border border-copper bg-copper/10 p-3 text-sm">
          <p>
            <strong>Preço atualizado:</strong> {changed.length === 1 ? `${changed[0]!.name} mudou de preço` : `${changed.length} itens mudaram de preço`} desde que foram adicionados. O resumo já reflete os novos valores.
          </p>
          <Button size="sm" variant="outline" onClick={() => acknowledge.mutate()} disabled={acknowledge.isPending}>Entendi</Button>
        </div>
      )}
      <table className="hidden w-full border-separate border-spacing-y-3 md:table">
        <caption className="sr-only">Itens no carrinho</caption>
        <thead>
          <tr className="text-left text-[15px] font-bold">
            <th scope="col" className="border-b border-line pb-3 font-bold">NFTs</th>
            <th scope="col" className="border-b border-line pb-3 font-bold">Preço</th>
            <th scope="col" className="border-b border-line pb-3 font-bold">Edições</th>
            <th scope="col" className="border-b border-line pb-3 font-bold">Total</th>
            <th scope="col" className="border-b border-line pb-3"><span className="sr-only">Ações</span></th>
          </tr>
        </thead>
        <tbody>
          {cart.items.map((item) => <CartRow key={item.id} item={item} />)}
        </tbody>
      </table>
      <ul className="space-y-4 md:hidden">
        {cart.items.map((item) => <CartCard key={item.id} item={item} />)}
      </ul>
    </>
  );
}

function useItemActions(item: CartItem) {
  const update = useUpdateCartItem();
  const remove = useRemoveCartItem();
  const setQuantity = (quantity: number) =>
    update.mutate(
      { itemId: item.id, quantity },
      { onError: (err) => toast.error(err instanceof ApiError ? err.message : "Não foi possível alterar a quantidade.") },
    );
  const removeItem = () =>
    remove.mutate(item.id, {
      onSuccess: () => toast.success(`${item.name} removido do carrinho`),
      onError: (err) => toast.error(`Não foi possível remover ${item.name}.`, { description: err instanceof ApiError ? err.message : undefined }),
    });
  return { setQuantity, removeItem, busy: update.isPending || remove.isPending };
}

const maxFor = (item: CartItem) => Math.max(1, Math.min(item.available, item.maxPerOrder));

function ItemNotice({ item }: { item: CartItem }) {
  if (item.status === "ok") return null;
  const text =
    item.status === "sold-out"
      ? "Esgotado — remova para continuar."
      : item.status === "insufficient-stock"
        ? `Só restam ${item.available}. Ajuste a quantidade.`
        : `Preço mudou: antes ${eth.format(item.priceWhenAdded)} ETH.`;
  return <p className={cn("text-xs", BLOCKING.has(item.status) ? "text-coral" : "text-copper-light")}>{text}</p>;
}

function CartRow({ item }: { item: CartItem }) {
  const id = useId();
  const { setQuantity, removeItem, busy } = useItemActions(item);
  return (
    <tr className={cn("bg-surface-card", busy && "opacity-70")} aria-busy={busy}>
      <td className="rounded-l-md">
        <div className="flex items-center gap-4">
          <img src={artworkUrl(item.image, 256)} alt="" width={70} height={70} className="size-[70px] rounded-l-md object-cover" />
          <div className="space-y-1 py-2">
            <Link to="/nft/$nftId" params={{ nftId: item.nftId }} className="block text-[15px] font-bold hover:text-copper-light">{item.name}</Link>
            <p className="text-sm text-sand">ID do token: {item.tokenId} · Edição {item.editionLabel}</p>
            <ItemNotice item={item} />
          </div>
        </div>
      </td>
      <td className="text-[15px] font-bold text-copper-light">{eth.format(item.unitPrice)} ETH</td>
      <td>
        <QuantityStepper id={id} value={item.quantity} max={maxFor(item)} onChange={setQuantity} disabled={busy || item.status === "sold-out"} compact label={`Quantidade de ${item.name}`} />
      </td>
      <td className="text-[15px] font-bold text-copper-light">{eth.format(item.lineTotal)} ETH</td>
      <td className="rounded-r-md pr-4 text-right">
        <button type="button" onClick={removeItem} disabled={busy} aria-label={`Remover ${item.name} do carrinho`} className="rounded-md p-2 text-sand hover:text-coral">
          <Icon name="delete" />
        </button>
      </td>
    </tr>
  );
}

function CartCard({ item }: { item: CartItem }) {
  const id = useId();
  const { setQuantity, removeItem, busy } = useItemActions(item);
  return (
    <li className={cn("flex overflow-hidden rounded-xl bg-surface-card", busy && "opacity-70")} aria-busy={busy}>
      <img src={artworkUrl(item.image, 256)} alt="" width={100} height={100} className="size-[100px] object-cover" />
      <div className="flex min-w-0 flex-1 flex-col justify-between p-2.5">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <Link to="/nft/$nftId" params={{ nftId: item.nftId }} className="block truncate text-[15px] font-bold">{item.name}</Link>
            <p className="text-sm text-sand">Edição: {item.editionLabel}</p>
          </div>
          <button type="button" onClick={removeItem} disabled={busy} aria-label={`Remover ${item.name} do carrinho`} className="p-1 text-sand hover:text-coral">
            <Icon name="delete" size={20} />
          </button>
        </div>
        <ItemNotice item={item} />
        <div className="flex items-center justify-between">
          <p className="text-lg font-bold text-copper-light">{eth.format(item.lineTotal)} ETH</p>
          <QuantityStepper id={id} value={item.quantity} max={maxFor(item)} onChange={setQuantity} disabled={busy || item.status === "sold-out"} compact label={`Quantidade de ${item.name}`} />
        </div>
      </div>
    </li>
  );
}

export function CouponForm({ cart }: { cart: Cart | undefined }) {
  const apply = useApplyCoupon();
  const remove = useRemoveCoupon();
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const id = useId();

  if (cart?.coupon) {
    return (
      <div className="flex items-center justify-between gap-3 rounded-md border border-line p-3 text-sm" role="status">
        <span>
          Cupom <strong className="text-copper-light">{cart.coupon.code}</strong> — {cart.coupon.description}
        </span>
        <button type="button" onClick={() => remove.mutate()} disabled={remove.isPending} className="text-copper-light underline-offset-4 hover:underline">Remover</button>
      </div>
    );
  }

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!code.trim()) return setError("Informe um código promocional");
    setError(null);
    apply.mutate(code.trim(), {
      onSuccess: () => {
        setCode("");
        toast.success("Cupom aplicado");
      },
      onError: (err) => setError(err instanceof ApiError ? (err.fields?.code ?? err.message) : "Não foi possível aplicar o cupom."),
    });
  };

  return (
    <form onSubmit={submit} noValidate>
      <label htmlFor={id} className="mb-2 block text-sm font-bold">Código promocional</label>
      <div className="flex">
        <input
          id={id}
          value={code}
          onChange={(e) => setCode(e.target.value)}
          placeholder="Digite o código promocional..."
          aria-invalid={Boolean(error)}
          aria-describedby={error ? `${id}-error` : undefined}
          className="h-10 min-w-0 flex-1 rounded-l-md border border-r-0 border-line-soft bg-transparent px-2 text-sm placeholder:text-khaki"
        />
        <button type="submit" disabled={apply.isPending || !cart?.items.length} className="h-10 rounded-r-md bg-copper px-5 text-base font-bold text-ink hover:bg-copper-light disabled:opacity-50">
          {apply.isPending ? "Aplicando…" : "Aplicar"}
        </button>
      </div>
      {error && <p id={`${id}-error`} role="alert" className="mt-2 text-xs text-coral">{error}</p>}
    </form>
  );
}

export function Totals({ subtotal, discount, networkFee, total }: Pick<Cart, "subtotal" | "discount" | "networkFee" | "total">) {
  return (
    <dl className="space-y-3 text-[15px]">
      <div className="flex justify-between"><dt>Subtotal</dt><dd className="text-lg">{eth.format(subtotal)} ETH</dd></div>
      <div className="flex justify-between"><dt>Desconto do lançamento</dt><dd>(-) {eth.format(discount)}</dd></div>
      <div>
        <div className="flex justify-between"><dt>Taxa de rede</dt><dd className="text-lg">{eth.format(networkFee)} ETH</dd></div>
        <p className="text-right text-xs text-copper-light">Taxa estimada</p>
      </div>
      <div className="flex justify-between border-t border-line pt-4 font-bold"><dt>Total</dt><dd className="text-lg text-copper-light">{eth.format(total)} ETH</dd></div>
    </dl>
  );
}

function CartSummary({ cart, loading }: { cart: Cart | undefined; loading: boolean }) {
  const session = useSession();
  const navigate = useNavigate();
  const blocked = cart?.items.some((i) => BLOCKING.has(i.status)) ?? false;
  const empty = !cart?.items.length;
  return (
    <aside aria-labelledby="summary-title" className="h-fit space-y-6 rounded-t-[28px] bg-surface-card p-5 md:rounded-md lg:bg-transparent lg:p-0">
      <h2 id="summary-title" className="hidden border-b border-line pb-3 text-lg font-bold md:block">Resumo da carteira</h2>
      <CouponForm cart={cart} />
      {loading || !cart ? (
        <div className="space-y-3" aria-hidden>{Array.from({ length: 4 }, (_, i) => <Skeleton key={i} className="h-5 w-full" />)}</div>
      ) : (
        <div aria-live="polite">
          <Totals {...cart} />
        </div>
      )}
      {blocked && <p className="text-sm text-coral" role="alert">Ajuste os itens destacados para continuar.</p>}
      <Button
        className="h-12 w-full rounded-full bg-gradient-to-r from-copper to-[#b97a45] text-base font-bold md:h-10 md:rounded-md md:bg-none"
        disabled={empty || blocked}
        onClick={() => void navigate(session ? { to: "/pagamento" } : { to: "/entrar", search: { redirect: "/pagamento" } })}
      >
        Conectar e finalizar
      </Button>
      <Link to="/" hash="catalogo" className="block text-center text-[15px] text-copper-light hover:underline">Continuar explorando</Link>
    </aside>
  );
}

function AlsoViewed() {
  const { data } = useCatalog({ sort: "popular" });
  return (
    <section aria-labelledby="also-title" className="container-page mt-20 hidden md:block">
      <h2 id="also-title" className="mb-6 border-b border-line pb-3 text-[17px] font-bold text-copper-light">Colecionadores também viram</h2>
      <ul className="grid grid-cols-3 gap-6 lg:grid-cols-5">
        {data
          ? data.items.slice(0, 5).map((n) => <li key={n.id}><NftCard nft={n} /></li>)
          : Array.from({ length: 5 }, (_, i) => <li key={i}><Skeleton className="aspect-[4/5] w-full" /></li>)}
      </ul>
    </section>
  );
}

function ItemsSkeleton() {
  return (
    <div className="space-y-3" aria-busy="true" aria-label="Carregando carrinho">
      {Array.from({ length: 3 }, (_, i) => (
        <div key={i} className="flex h-[70px] items-center gap-4 rounded-md bg-surface-card">
          <Skeleton className="size-[70px] rounded-l-md" />
          <Skeleton className="h-4 w-1/3" />
          <Skeleton className="ml-auto mr-4 h-4 w-20" />
        </div>
      ))}
    </div>
  );
}

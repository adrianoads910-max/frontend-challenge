import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Loader2, X } from "lucide-react";
import { useEffect, useRef } from "react";
import type { Order } from "@/api/contracts";
import { requireAuth } from "@/app/guards";
import { Icon } from "@/components/icon";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useOrder } from "@/features/checkout/orders";
import { eth } from "@/lib/eth";
import { ApiError } from "@/lib/http";
import { artworkUrl } from "@/lib/images";
import { NETWORK_LABELS, PROVIDER_LABELS } from "@/lib/labels";
import { NotFound } from "./__root";

export const Route = createFileRoute("/pedido/$orderId")({
  beforeLoad: requireAuth,
  head: () => ({ meta: [{ title: "Pedido — Kurio" }] }),
  component: OrderPage,
});

function OrderPage() {
  const { orderId } = Route.useParams();
  const { data: order, isPending, isError, error, refetch, isFetching } = useOrder(orderId);

  if (isPending) {
    return (
      <div className="container-page grid place-items-center py-16" aria-busy="true" aria-label="Carregando pedido">
        <Skeleton className="h-[600px] w-full max-w-[578px]" />
      </div>
    );
  }
  if (isError) {
    if (error instanceof ApiError && (error.status === 404 || error.status === 403)) {
      return <NotFound title="Pedido não encontrado" description="Este pedido não existe ou pertence a outra conta." />;
    }
    return (
      <div role="alert" className="container-page space-y-3 py-16 text-center">
        <p>Não foi possível carregar o pedido.</p>
        <Button onClick={() => void refetch()} disabled={isFetching}>Tentar novamente</Button>
      </div>
    );
  }
  return (
    <div className="container-page grid place-items-center py-10 md:py-16">
      {order.status === "pending" && <PendingOrder order={order} />}
      {order.status === "declined" && <DeclinedOrder order={order} />}
      {order.status === "confirmed" && <Receipt order={order} />}
    </div>
  );
}

const card = "relative w-full max-w-[578px] rounded-sm border-b-[10px] border-copper bg-surface-card shadow-card";

function PendingOrder({ order }: { order: Order }) {
  return (
    <section className={`${card} p-8 text-center`} aria-labelledby="pending-title" aria-busy="true">
      <Loader2 className="mx-auto mb-4 size-10 animate-spin text-copper" aria-hidden />
      <h1 id="pending-title" className="text-lg font-bold">Processando pagamento…</h1>
      <p className="mt-2 text-sm text-sand" role="status">
        Aguardando a confirmação da {NETWORK_LABELS[order.network]}. Você pode recarregar ou fechar esta página: o pedido continua sendo processado e não será duplicado.
      </p>
      <p className="mt-4 text-xs text-khaki">Pedido {order.id} · total {eth.format(order.total)} ETH</p>
    </section>
  );
}

function DeclinedOrder({ order }: { order: Order }) {
  return (
    <section className={`${card} p-8 text-center`} aria-labelledby="declined-title">
      <Icon name="danger-triangle" size={40} className="mx-auto mb-4 text-coral" />
      <h1 id="declined-title" className="text-lg font-bold">Pagamento recusado</h1>
      <p className="mt-2 text-sm text-sand" role="alert">
        {order.declineReason ?? "A carteira recusou o pagamento."} Nenhum valor foi cobrado e seus itens continuam no carrinho.
      </p>
      <div className="mt-6 flex justify-center gap-3">
        <Link to="/carrinho" className="rounded-md bg-copper px-5 py-2.5 font-bold text-ink hover:bg-copper-light">Voltar ao carrinho</Link>
        <Link to="/pagamento" className="rounded-md border border-line px-5 py-2.5 hover:border-copper">Tentar novamente</Link>
      </div>
    </section>
  );
}

/** Rendered only for a CONFIRMED order, from the order snapshot (catalog changes never affect it). */
function Receipt({ order }: { order: Order }) {
  const navigate = useNavigate();
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => heading.current?.focus(), []);
  const date = new Date(order.updatedAt).toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "numeric" });
  const tx = order.txHash ? `${order.txHash.slice(0, 6)}…${order.txHash.slice(-4)}`.toUpperCase().replace("0X", "0x") : "—";

  return (
    <section className={card} aria-labelledby="receipt-title">
      <button type="button" onClick={() => void navigate({ to: "/" })} aria-label="Fechar recibo" className="absolute top-5 right-5 text-copper hover:text-copper-light">
        <X className="size-5" aria-hidden />
      </button>
      <header className="flex flex-col items-center gap-3 border-b border-copper px-6 pt-6 pb-5 text-center">
        <Icon name="thank-you" className="text-copper" />
        <h1 id="receipt-title" ref={heading} tabIndex={-1} className="text-base font-bold text-sand outline-none">
          Seus NFTs agora estão na sua carteira
        </h1>
      </header>
      <dl className="grid grid-cols-2 gap-y-3 border-b border-copper px-6 py-3 text-sm sm:grid-cols-4 sm:divide-x sm:divide-copper">
        <div className="px-3"><dt className="font-bold text-sand">ID da transação</dt><dd className="text-sand" title={order.txHash ?? undefined}>{tx}</dd></div>
        <div className="px-3"><dt className="text-sand">Data</dt><dd className="text-sand">{date}</dd></div>
        <div className="px-3"><dt className="text-sand">Total</dt><dd className="text-sand">{eth.format(order.total)} ETH</dd></div>
        <div className="px-3"><dt className="font-bold text-sand">Carteira</dt><dd className="text-sand">{PROVIDER_LABELS[order.walletProvider]}</dd></div>
      </dl>
      <div className="px-6 pt-6 pb-8 sm:px-11">
        <table className="w-full text-sm">
          <caption className="mb-3 text-left text-[15px] font-bold">Detalhes da transação</caption>
          <thead>
            <tr className="border-b border-line text-left text-[15px]">
              <th scope="col" className="pb-2 font-bold">NFTs</th>
              <th scope="col" className="pb-2 text-center font-bold">Edições</th>
              <th scope="col" className="pb-2 text-right font-bold">Subtotal</th>
            </tr>
          </thead>
          <tbody>
            {order.lines.map((l) => (
              <tr key={l.editionId}>
                <td className="py-2">
                  <div className="flex items-center gap-3">
                    <img src={artworkUrl(l.image, 256)} alt="" width={66} height={66} className="size-[66px] rounded-md object-cover" />
                    <div>
                      <p className="font-bold">{l.name}</p>
                      <p className="text-sand">ID do token: {l.tokenId}</p>
                    </div>
                  </div>
                </td>
                <td className="text-center text-sand">(x {l.quantity})</td>
                <td className="text-right text-[17px] font-bold whitespace-nowrap text-copper-light">{eth.format(l.lineTotal)} ETH</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            {!eth.isZero(order.discount) && (
              <tr><td /><th scope="row" className="pt-3 text-left font-normal">Desconto{order.coupon ? ` (${order.coupon.code})` : ""}</th><td className="pt-3 text-right">(-) {eth.format(order.discount)} ETH</td></tr>
            )}
            <tr><td /><th scope="row" className="pt-3 text-left font-normal">Taxa de rede</th><td className="pt-3 text-right text-lg">{eth.format(order.networkFee)} ETH</td></tr>
            <tr className="border-b border-line"><td /><th scope="row" className="pb-3 text-left font-bold">Total</th><td className="pb-3 text-right text-lg font-bold text-copper-light">{eth.format(order.total)} ETH</td></tr>
          </tfoot>
        </table>
        <p className="mt-4 text-center text-sm leading-[22px] text-copper-light">
          Transação confirmada na {NETWORK_LABELS[order.network]}. A propriedade foi transferida para sua carteira conectada e registrada na rede.
        </p>
        {order.explorerUrl && (
          <div className="mt-5 text-center">
            <a href={order.explorerUrl} target="_blank" rel="noopener noreferrer" className="inline-block rounded-sm bg-copper px-4 py-3 text-[15px] font-bold text-ink hover:bg-copper-light">
              Ver no Etherscan<span className="sr-only"> (simulado, abre em nova aba)</span>
            </a>
            <p className="mt-2 text-xs text-khaki">Link de exploração simulado.</p>
          </div>
        )}
      </div>
    </section>
  );
}

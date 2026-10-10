import { useEffect, useState } from "react";
import { toast } from "sonner";
import { useServices } from "@/app/context";

/**
 * Turns realtime notices into accessible feedback: a polite live region (screen readers) plus a
 * toast for sighted users. Order results are announced assertively.
 */
export function RealtimeAnnouncer() {
  const { realtime } = useServices();
  const [polite, setPolite] = useState("");
  const [assertive, setAssertive] = useState("");
  const [status, setStatus] = useState(realtime.status);

  useEffect(
    () =>
      realtime.onNotice((notice) => {
        if (notice.kind === "connection") {
          setStatus(notice.status);
          if (notice.status === "reconnecting") setPolite("Conexão em tempo real perdida. Reconectando…");
          if (notice.status === "connected") setPolite("Conexão em tempo real restabelecida.");
          return;
        }
        if (notice.kind === "nft-updated") {
          const what = notice.name ?? "Um NFT";
          const msg = notice.soldOut
            ? `${what} esgotou.`
            : notice.priceUp === undefined
              ? `${what} teve preço ou disponibilidade atualizados.`
              : `${what} ${notice.priceUp ? "ficou mais caro" : "ficou mais barato"}.`;
          setPolite(msg);
          return;
        }
        const { order } = notice;
        const msg =
          order.status === "confirmed"
            ? "Pagamento confirmado! Seus NFTs estão na sua carteira."
            : order.status === "declined"
              ? "Pagamento recusado. Nenhum valor foi cobrado."
              : "Pedido atualizado.";
        setAssertive(msg);
        if (order.status === "declined") toast.error(msg);
        else if (order.status === "confirmed") toast.success(msg);
      }),
    [realtime],
  );

  return (
    <>
      <div className="sr-only" aria-live="polite" role="status">{polite}</div>
      <div className="sr-only" aria-live="assertive" role="alert">{assertive}</div>
      {status === "reconnecting" && (
        <div role="status" className="fixed top-2 left-1/2 z-50 -translate-x-1/2 rounded-full border border-line bg-surface-card px-4 py-1.5 text-xs text-sand shadow-lg">
          Reconectando ao tempo real…
        </div>
      )}
    </>
  );
}

import { FlaskConical } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";

/*
 * Demo control panel for the mock backend. It talks to the `/__mock/*` control plane (handled by
 * MSW), never to React state: the UI under test only learns about changes through REST and
 * Socket.IO, as it would in production. Hidden from visual regression via data-visual-ignore.
 */

interface MockState {
  scenario: string;
  scenarios: Record<string, { label: string; description: string }>;
  sockets: number;
  nfts: Array<{ id: string; name: string; price: string; version: number }>;
}

async function control(path: string, body?: object) {
  const res = await fetch(`/__mock/${path}`, {
    method: body === undefined && path === "state" ? "GET" : "POST",
    headers: { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return res.json();
}

export function MockPanel() {
  const [open, setOpen] = useState(false);
  const [state, setState] = useState<MockState | null>(null);
  const [nftId, setNftId] = useState("");

  useEffect(() => {
    if (!open) return;
    void control("state").then((s: MockState) => {
      setState(s);
      setNftId((cur) => cur || s.nfts[0]?.id || "");
    });
  }, [open]);

  const run = async (label: string, path: string, body: object = {}, reload = false) => {
    await control(path, body);
    toast.info(`Mock: ${label}`);
    if (reload) window.location.reload();
    else setState(await control("state"));
  };

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger
        data-visual-ignore
        className="fixed bottom-24 left-3 z-50 flex items-center gap-1.5 rounded-full border border-line bg-surface-card px-3 py-2 text-xs text-sand shadow-lg hover:text-cream md:bottom-4"
      >
        <FlaskConical className="size-4" aria-hidden /> Cenários
      </SheetTrigger>
      <SheetContent side="left" className="w-[360px] overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Backend simulado</SheetTitle>
          <SheetDescription>Cenários de rede e falhas do MSW (persistem no navegador).</SheetDescription>
        </SheetHeader>
        {state && (
          <div className="space-y-6 px-4 pb-6 text-sm">
            <fieldset className="space-y-2">
              <legend className="mb-2 font-bold">Cenário ativo</legend>
              {Object.entries(state.scenarios).map(([id, s]) => (
                <label key={id} className="flex cursor-pointer gap-2 rounded-md p-1.5 hover:bg-surface-raised">
                  <input
                    type="radio"
                    name="scenario"
                    checked={state.scenario === id}
                    onChange={() => void run(s.label, "scenario", { id })}
                    className="mt-1 accent-copper"
                  />
                  <span>
                    <span className="block font-medium">{s.label}</span>
                    <span className="block text-xs text-sand">{s.description}</span>
                  </span>
                </label>
              ))}
            </fieldset>

            <section className="space-y-2">
              <h3 className="font-bold">Eventos em tempo real</h3>
              <p className="text-xs text-sand">{state.sockets} conexão(ões) Socket.IO ativas.</p>
              <label htmlFor="mock-nft" className="block text-xs">NFT alvo</label>
              <select id="mock-nft" value={nftId} onChange={(e) => setNftId(e.target.value)} className="h-9 w-full rounded-md border border-input bg-surface-raised px-2">
                {state.nfts.map((n) => (
                  <option key={n.id} value={n.id}>{n.name} — {n.price} ETH (v{n.version})</option>
                ))}
              </select>
              <div className="grid grid-cols-2 gap-2">
                <Button size="sm" variant="outline" onClick={() => void run("preço +0.10 ETH", `nfts/${nftId}/mutate`, { priceDelta: "0.10" })}>Preço +0.10</Button>
                <Button size="sm" variant="outline" onClick={() => void run("preço -0.10 ETH", `nfts/${nftId}/mutate`, { priceDelta: "-0.10" })}>Preço −0.10</Button>
                <Button size="sm" variant="outline" onClick={() => void run("NFT esgotado", `nfts/${nftId}/mutate`, { available: 0 })}>Esgotar</Button>
                <Button size="sm" variant="outline" onClick={() => void run("estoque reposto", `nfts/${nftId}/mutate`, { available: 20 })}>Repor estoque</Button>
                <Button size="sm" variant="outline" onClick={() => void run("evento duplicado", "events/duplicate")}>Duplicar evento</Button>
                <Button size="sm" variant="outline" onClick={() => void run("evento antigo", "events/stale")}>Evento antigo</Button>
                <Button size="sm" variant="outline" className="col-span-2" onClick={() => void run("sockets derrubados", "socket/disconnect")}>Derrubar conexão</Button>
              </div>
            </section>

            <section className="space-y-2">
              <h3 className="font-bold">Sessão e dados</h3>
              <div className="grid gap-2">
                <Button size="sm" variant="outline" onClick={() => void run("sessões expiradas", "sessions/expire")}>Expirar sessão</Button>
                <Button size="sm" variant="destructive" onClick={() => void run("dados restaurados", "reset", {}, true)}>Resetar cenário e dados</Button>
              </div>
              <p className="text-xs text-sand">Contas: ana@kurio.dev / bruno@kurio.dev — senha Kurio2026</p>
            </section>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}

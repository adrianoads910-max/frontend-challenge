import { useState, type FormEvent } from "react";
import { Icon } from "@/components/icon";
import { notAvailable, OutOfScopeLink } from "./out-of-scope";

const FEATURES = [
  { letter: "W", title: "Segurança da carteira", text: "Proteja sua carteira e colecione arte digital verificada com confiança." },
  { letter: "C", title: "Criadores em destaque", text: "Conheça artistas, estúdios e comunidades que moldam a cultura digital na rede." },
  { letter: "D", title: "Alertas de lançamentos", text: "Receba calendários de cunhagem, novidades de listas de acesso e análises do mercado." },
];

const COLUMNS = [
  { title: "Meu perfil", links: ["Meu perfil", "Minha coleção", "Atividade", "Estúdio do criador", "Lista de interesse"] },
  { title: "Central de ajuda", links: ["Central de ajuda", "Como comprar NFTs", "Carteira e segurança", "Política do mercado", "Denunciar item"] },
  { title: "Coleções", links: ["Arte digital", "Fotografia", "Música", "Arte 3D", "Utilidade"] },
];

function Newsletter() {
  const [error, setError] = useState<string | null>(null);
  const onSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const email = String(new FormData(e.currentTarget).get("email") ?? "");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setError("Informe um e-mail válido");
      return;
    }
    setError(null);
    notAvailable("Inscrição em lançamentos");
  };
  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-3" aria-labelledby="newsletter-title">
      <h2 id="newsletter-title" className="text-[17px] leading-4 font-bold">Antecipe-se ao próximo lançamento</h2>
      <div className="flex">
        <label htmlFor="newsletter-email" className="sr-only">E-mail</label>
        <input
          id="newsletter-email"
          name="email"
          type="email"
          autoComplete="email"
          placeholder="digite seu e-mail..."
          aria-invalid={Boolean(error)}
          aria-describedby={error ? "newsletter-error" : undefined}
          className="h-10 min-w-0 flex-1 rounded-l-md bg-surface-raised px-3 text-sm text-cream placeholder:text-khaki"
        />
        <button type="submit" className="h-10 rounded-r-md bg-copper px-4 text-base font-bold text-ink hover:bg-copper-light">Enviar</button>
      </div>
      {error && <p id="newsletter-error" className="text-xs text-coral">{error}</p>}
      <p className="text-[13px] leading-[22px] text-sand">Receba lançamentos selecionados, histórias de criadores e novidades do mercado.</p>
    </form>
  );
}

export function SiteFooter() {
  return (
    <footer className="container-page mt-20 mb-24 md:mb-0" aria-label="Rodapé">
      <div className="rounded-t-md bg-surface-card">
        <div className="grid gap-8 px-6 py-8 md:grid-cols-2 lg:grid-cols-4 lg:px-12">
          {FEATURES.map((f) => (
            <section key={f.letter} className="lg:border-r lg:border-copper lg:pr-6">
              <div aria-hidden className="mb-3 grid size-[74px] place-items-center rounded-full bg-copper text-2xl font-bold text-ink">{f.letter}</div>
              <h2 className="mb-3 text-[17px] font-bold">{f.title}</h2>
              <p className="text-sm leading-[22px] text-copper-light">{f.text}</p>
            </section>
          ))}
          <Newsletter />
        </div>
        <div className="grid gap-4 bg-surface-dark px-8 py-7 text-sm md:grid-cols-4 md:items-center">
          <span className="font-bold tracking-[0.1em]">KURIO</span>
          <span>Feito para colecionadores, criadores e cultura</span>
          <span>contato@email.com</span>
          <span>+55 11 4002 8922</span>
        </div>
        <div className="grid gap-8 px-8 py-8 md:grid-cols-2 lg:grid-cols-4">
          {COLUMNS.map((col) => (
            <nav key={col.title} aria-label={col.title}>
              <h2 className="mb-3 text-lg font-bold">{col.title}</h2>
              <ul className="space-y-2.5 text-sm">
                {col.links.map((l) => (
                  <li key={l}><OutOfScopeLink label={l} /></li>
                ))}
              </ul>
            </nav>
          ))}
          <div>
            <h2 className="mb-3 text-lg font-bold">Redes sociais</h2>
            <ul className="mb-6 flex gap-2.5" aria-label="Redes sociais">
              {[
                { label: "Twitter", icon: "twitter" as const },
                { label: "LinkedIn", icon: "linkedin" as const },
                { label: "Contato", icon: "message" as const },
              ].map((s) => (
                <li key={s.label}>
                  <button
                    type="button"
                    onClick={() => notAvailable(s.label)}
                    aria-label={`${s.label} (indisponível nesta demonstração)`}
                    className="grid size-8 place-items-center rounded-md border border-copper text-copper hover:bg-copper hover:text-ink"
                  >
                    <Icon name={s.icon} />
                  </button>
                </li>
              ))}
            </ul>
            <h2 className="mb-3 text-lg font-bold">Carteiras compatíveis</h2>
            <p className="inline-block rounded-md border border-line bg-surface-dark px-2.5 py-1 text-[9px] font-bold tracking-wide text-copper-light">
              METAMASK · WALLETCONNECT · COINBASE
            </p>
          </div>
        </div>
      </div>
      <p className="py-4 text-center text-[13px]">© 2026 Kurio. Propriedade digital para todos.</p>
    </footer>
  );
}

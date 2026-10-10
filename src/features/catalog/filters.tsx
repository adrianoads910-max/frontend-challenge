import { useState } from "react";
import type { CatalogPage, CatalogQuery, Category, Network } from "@/api/contracts";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Skeleton } from "@/components/ui/skeleton";
import { eth, fromWei, toWei } from "@/lib/eth";
import { CATEGORY_LABELS, NETWORK_LABELS } from "@/lib/labels";
import { cn } from "@/lib/utils";

/** Slider positions are integer hundredths of ETH; the URL and the API keep decimal strings. */
const CENTI = 10n ** 16n;
const toCenti = (v: string) => Number(toWei(v) / CENTI);
const fromCenti = (c: number) => fromWei(BigInt(Number.isFinite(c) ? Math.round(c) : 0) * CENTI);

interface FiltersProps {
  query: CatalogQuery;
  facets: CatalogPage["facets"] | undefined;
  onChange: (patch: Partial<CatalogQuery>) => void;
  idPrefix?: string;
}

export function CatalogFilters({ query, facets, onChange, idPrefix = "f" }: FiltersProps) {
  const toggle = <T extends string>(list: T[] | undefined, value: T) => {
    const set = new Set(list ?? []);
    if (set.has(value)) set.delete(value);
    else set.add(value);
    return set.size ? [...set] : undefined;
  };

  return (
    <div className="flex flex-col gap-7">
      <FacetGroup
        title="Coleções"
        idPrefix={`${idPrefix}-cat`}
        items={facets?.categories.map((f) => ({ id: f.id as Category, label: CATEGORY_LABELS[f.id as Category], count: f.count }))}
        selected={query.categories}
        onToggle={(id) => onChange({ categories: toggle(query.categories, id) })}
      />
      <PriceFilter query={query} facets={facets} onChange={onChange} idPrefix={idPrefix} />
      <FacetGroup
        title="Rede"
        idPrefix={`${idPrefix}-net`}
        items={facets?.networks.map((f) => ({ id: f.id as Network, label: NETWORK_LABELS[f.id as Network], count: f.count }))}
        selected={query.networks}
        onToggle={(id) => onChange({ networks: toggle(query.networks, id) })}
      />
    </div>
  );
}

function FacetGroup<T extends string>({
  title,
  items,
  selected,
  onToggle,
  idPrefix,
}: {
  title: string;
  items: Array<{ id: T; label: string; count: number }> | undefined;
  selected: T[] | undefined;
  onToggle: (id: T) => void;
  idPrefix: string;
}) {
  return (
    <fieldset>
      <legend className="mb-3 text-base font-bold">{title}</legend>
      {!items ? (
        <div className="space-y-3" aria-hidden>
          {Array.from({ length: 5 }, (_, i) => <Skeleton key={i} className="h-4 w-full" />)}
        </div>
      ) : (
        <ul className="space-y-1">
          {items.map((item) => {
            const checked = selected?.includes(item.id) ?? false;
            const inputId = `${idPrefix}-${item.id}`;
            return (
              <li key={item.id}>
                <label
                  htmlFor={inputId}
                  className={cn(
                    "flex cursor-pointer items-center justify-between rounded-md px-1.5 py-1.5 text-sm text-copper-light transition-colors hover:bg-surface-raised has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-copper-light",
                    checked && "bg-surface-raised font-bold text-cream",
                  )}
                >
                  <span className="flex items-center gap-2">
                    <input
                      id={inputId}
                      type="checkbox"
                      checked={checked}
                      onChange={() => onToggle(item.id)}
                      className="size-3.5 accent-copper"
                    />
                    {item.label}
                  </span>
                  <span className="text-sand" aria-label={`${item.count} itens`}>({item.count})</span>
                </label>
              </li>
            );
          })}
        </ul>
      )}
    </fieldset>
  );
}

function PriceFilter({ query, facets, onChange, idPrefix }: FiltersProps) {
  const bounds = facets?.priceRange;
  const min = bounds ? Math.floor(toCenti(bounds.min)) : 0;
  const max = bounds ? Math.ceil(toCenti(bounds.max)) : 100;
  const current = (): [number, number] => [
    query.minPrice ? toCenti(query.minPrice) : min,
    query.maxPrice ? toCenti(query.maxPrice) : max,
  ];
  const [range, setRange] = useState<[number, number]>(current);
  // Keep the draft in sync when the URL or the bounds change (history navigation, reset),
  // adjusting state during render rather than in an effect.
  const syncKey = `${query.minPrice}|${query.maxPrice}|${min}|${max}`;
  const [syncedKey, setSyncedKey] = useState(syncKey);
  if (syncedKey !== syncKey) {
    setSyncedKey(syncKey);
    setRange(current());
  }

  const apply = () => {
    const [lo, hi] = range;
    onChange({ minPrice: lo > min ? fromCenti(lo) : undefined, maxPrice: hi < max ? fromCenti(hi) : undefined });
  };

  return (
    <fieldset>
      <legend className="mb-4 text-base font-bold">Faixa de preço</legend>
      <Slider
        value={range}
        min={min}
        max={max}
        step={1}
        disabled={!bounds}
        onValueChange={(v) => Array.isArray(v) && setRange([v[0]!, v[1]!])}
        thumbLabels={["Preço mínimo", "Preço máximo"]}
        getAriaValueText={(v) => `${eth.format(fromCenti(v), 2)} ETH`}
        className="mb-3 [&_[data-slot=slider-thumb]]:size-3.5 [&_[data-slot=slider-thumb]]:border-copper [&_[data-slot=slider-thumb]]:bg-copper"
      />
      <p className="mb-3 text-sm" id={`${idPrefix}-price-label`}>
        Preço: {eth.format(fromCenti(range[0]), 2)} – {eth.format(fromCenti(range[1]), 2)} ETH
      </p>
      <Button size="sm" onClick={apply} disabled={!bounds} className="h-[26px] rounded-sm px-2.5 text-sm" aria-describedby={`${idPrefix}-price-label`}>
        Aplicar
      </Button>
    </fieldset>
  );
}

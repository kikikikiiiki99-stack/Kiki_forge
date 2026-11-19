import { Star } from "lucide-react";
import { useSF } from "@/context/SFContext";
import type { FeaturedItem } from "@/lib/site";
import { sectionOn, useSite } from "@/lib/site";

// Admin-curated highlights at the top of the Feed. Hidden when there are none.
export const FeaturedStrip = ({ items, loading }: { items?: FeaturedItem[]; loading: boolean }) => {
  const { openPredict, setPage } = useSF() as unknown as { openPredict: (s: string) => void; setPage: (p: string) => void };
  const site = useSite().data?.settings;
  const open = (i: FeaturedItem) => {
    if (i.link === "markets" && sectionOn(site, "markets")) setPage("markets");
    else if (i.link !== "none") openPredict(i.sym);
  };
  if (loading) return <div className="grid sm:grid-cols-3 gap-4 mb-6"><div className="sk h-24" /><div className="sk h-24 hidden sm:block" /><div className="sk h-24 hidden sm:block" /></div>;
  if (!items?.length) return null;
  return (
    <div className="mb-8" data-testid="featured-strip">
      <p className="kicker mb-3 flex items-center gap-1.5"><Star size={11} /> FEATURED</p>
      <div className="flex gap-4 overflow-x-auto snap-x pb-2 -mx-4 px-4 sm:mx-0 sm:px-0 sm:grid sm:grid-cols-2 xl:grid-cols-3 sm:overflow-visible">
        {items.map((i, k) => (
          <button key={i.id} onClick={() => open(i)} disabled={i.link === "none"} className={`sf-panel p-5 text-left rise snap-start min-w-[260px] sm:min-w-0 ${i.link === "none" ? "cursor-default" : "sf-hover"}`} style={{ animationDelay: `${k * 50}ms` }} data-testid={`featured-item-${i.id}`}>
            <div className="flex items-center gap-3">
              <span className={`sf-tone sf-tone-${i.tone}`}>{i.sym}</span>
              <p className="font-medium truncate flex-1">{i.title}</p>
              {i.link !== "none" && <span className="font-mono text-[10px] text-neutral-500 shrink-0">{i.link === "markets" ? "MARKETS →" : "FORECAST →"}</span>}
            </div>
            {i.note && <p className="text-sm text-neutral-400 mt-3 line-clamp-2 leading-relaxed">{i.note}</p>}
          </button>
        ))}
      </div>
    </div>
  );
};

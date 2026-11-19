import { Lock as LockIcon } from "lucide-react";
import { useSF } from "@/context/SFContext";

export const Locked = ({ gate, children, className = "", label }) => {
  const { can, snap, upgrade, setPage } = useSF();
  if (!snap) return null;
  if (can(gate)) return <div className={className}>{children}</div>;
  const need = snap.gates[gate];
  const tier = snap.tiers[need - 1];
  return (
    <div className={`relative ${className}`} data-testid={`locked-${gate}`}>
      <div className="pointer-events-none select-none blur-[6px] opacity-40" aria-hidden="true">{children}</div>
      <div className="absolute inset-0 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
        <div className="sf-panel p-5 max-w-sm text-center">
          <LockIcon className="mx-auto mb-3 accent" size={22} />
          <p className="font-disp text-lg tracking-wide">{label || "Locked panel"}</p>
          <p className="text-sm text-neutral-400 mt-1">Unlocks at <b className="accent">T{need} {tier.name}</b> · {tier.price}</p>
          <div className="flex gap-2 justify-center mt-4">
            <button className="sf-btn sf-btn-p" data-testid={`unlock-${gate}-button`} onClick={() => upgrade(need)}>Upgrade</button>
            <button className="sf-btn" data-testid={`compare-tiers-${gate}-button`} onClick={() => setPage("tiers")}>Compare tiers</button>
          </div>
        </div>
      </div>
    </div>
  );
};

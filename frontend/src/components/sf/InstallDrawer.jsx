import { Download, ExternalLink, Monitor, Smartphone, Apple, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { useInstall, platform } from "@/hooks/useInstall";

const STEPS = {
  ios: { icon: Apple, title: "iPhone / iPad", steps: ["Open StockForge in Safari", "Tap the Share button", "Choose “Add to Home Screen”", "Tap Add — it opens full-screen like a native app"] },
  android: { icon: Smartphone, title: "Android", steps: ["Open StockForge in Chrome", "Tap the ⋮ menu", "Choose “Install app”", "Launch it from your home screen"] },
  desktop: { icon: Monitor, title: "Windows / Mac / Linux", steps: ["Open StockForge in Chrome or Edge", "Click the install icon in the address bar", "Confirm Install", "Pin it to your dock or taskbar"] },
};

export const InstallDrawer = ({ open, onOpenChange, extra }) => {
  const { canPrompt, prompt, installed, inFrame } = useInstall();
  const me = platform();
  const order = [me, ...Object.keys(STEPS).filter((k) => k !== me)];

  const install = async () => {
    if (await prompt()) {
      toast.success("StockForge installed");
      onOpenChange(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="bg-[#070707] border-l border-[var(--a-line)] w-full sm:max-w-md overflow-y-auto" data-testid="install-drawer">
        <SheetHeader>
          <p className="kicker">GET THE APP</p>
          <SheetTitle className="font-disp text-3xl text-left">Download StockForge</SheetTitle>
          <SheetDescription className="text-left">Install the terminal on your phone or computer. It opens in its own window, works offline with your last saved prices and updates itself.</SheetDescription>
        </SheetHeader>
        <div className="mt-6 space-y-4">
          {installed ? (
            <div className="sf-panel p-4 flex items-center gap-3" data-testid="install-already-installed"><CheckCircle2 className="bull" /> You're running the installed app.</div>
          ) : canPrompt ? (
            <button className="sf-btn sf-btn-p w-full !py-4 !text-sm" onClick={install} data-testid="install-now-button"><Download size={18} /> Install StockForge now</button>
          ) : inFrame ? (
            <button className="sf-btn sf-btn-p w-full !py-4 !text-sm" onClick={() => window.open(window.location.href, "_blank", "noopener")} data-testid="install-open-tab-button">
              <ExternalLink size={18} /> Open in a new tab to install
            </button>
          ) : (
            <p className="text-sm text-neutral-400" data-testid="install-manual-hint">Your browser doesn't offer one-tap install here — follow the steps for your device below.</p>
          )}
          {extra}
          {order.map((k) => {
            const S = STEPS[k];
            return (
              <div key={k} className={`sf-panel p-4 ${k === me ? "" : "opacity-70"}`} data-testid={`install-steps-${k}`}>
                <div className="flex items-center gap-2 mb-3"><S.icon size={16} className="accent" /><span className="font-disp text-lg">{S.title}</span>{k === me && <span className="kicker ml-auto">THIS DEVICE</span>}</div>
                <ol className="space-y-1.5 text-sm text-neutral-300">
                  {S.steps.map((s, i) => <li key={s} className="flex gap-3"><span className="font-mono accent">0{i + 1}</span>{s}</li>)}
                </ol>
              </div>
            );
          })}
        </div>
      </SheetContent>
    </Sheet>
  );
};

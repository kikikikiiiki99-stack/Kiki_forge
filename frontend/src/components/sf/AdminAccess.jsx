import { useState } from "react";
import { toast } from "sonner";
import { KeyRound, FileArchive, ShieldCheck } from "lucide-react";
import { useSF } from "@/context/SFContext";
import { API } from "@/lib/sfapi";
import { useAuth } from "@clerk/react";

export const useSourceDownload = () => {
  const { getToken } = useAuth();
  const [busy, setBusy] = useState(false);
  const download = async () => {
    setBusy(true);
    try {
      const r = await fetch(`${API}/admin/download`, { headers: { Authorization: `Bearer ${await getToken()}` } });
      if (!r.ok) throw new Error(r.status === 403 ? "Admin only" : `Download failed (${r.status})`);
      const name = (r.headers.get("content-disposition") || "").match(/filename="(.+)"/)?.[1] || "stockforge-source.zip";
      const url = URL.createObjectURL(await r.blob());
      Object.assign(document.createElement("a"), { href: url, download: name }).click();
      URL.revokeObjectURL(url);
      toast.success("Source code downloaded");
    } catch (e) {
      toast.error(e.message);
    } finally {
      setBusy(false);
    }
  };
  return { download, busy };
};

export const AdminAccess = ({ onDone }) => {
  const { me, api, refreshMe, setPage } = useSF();
  const [code, setCode] = useState("");
  const [phrase, setPhrase] = useState("");
  const { download, busy } = useSourceDownload();
  const unlock = async (e) => {
    e.preventDefault();
    try {
      await api.post("/admin/unlock", { code, passphrase: phrase });
      await refreshMe();
      setCode(""); setPhrase("");
      toast.success("Admin access granted");
    } catch (err) {
      toast.error(err.message);
    }
  };
  return (
    <div className="sf-panel p-4" data-testid="admin-access-panel">
      <div className="flex items-center gap-2 mb-3"><KeyRound size={16} className="accent" /><span className="font-disp text-lg">Download as file · admin</span></div>
      {me?.is_admin ? (
        <div className="space-y-2">
          <p className="text-sm text-neutral-400 flex items-center gap-2"><ShieldCheck size={14} className="bull" /> Admin unlocked</p>
          <button className="sf-btn sf-btn-p w-full" onClick={download} disabled={busy} data-testid="admin-download-source-button"><FileArchive size={16} />{busy ? "Packing…" : "Download full source (.zip)"}</button>
          <button className="sf-btn w-full" onClick={() => { setPage("admin"); onDone?.(); }} data-testid="admin-open-panel-button">Open admin panel</button>
        </div>
      ) : (
        <form onSubmit={unlock} className="space-y-2">
          <p className="text-sm text-neutral-400">Enter the admin code and passphrase to download the complete app as a file (to continue building it anywhere) and manage tiers, logins and stats.</p>
          <div className="grid grid-cols-[1fr_1fr_auto] gap-2">
            <input className="sf-input min-w-0" type="password" inputMode="numeric" placeholder="Admin code" value={code} onChange={(e) => setCode(e.target.value)} data-testid="admin-code-input" />
            <input className="sf-input min-w-0" type="password" placeholder="Passphrase" value={phrase} onChange={(e) => setPhrase(e.target.value)} data-testid="admin-passphrase-input" />
            <button className="sf-btn sf-btn-p" type="submit" disabled={!code || !phrase} data-testid="admin-code-submit-button">Unlock</button>
          </div>
        </form>
      )}
    </div>
  );
};

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Pencil, Plus, Trash2, X } from "lucide-react";
import { useSF } from "@/context/SFContext";
import type { FeaturedItem, FeaturedItemIn, ItemLink, ItemTone, SFApi } from "@/lib/site";
import { SITE_KEY } from "@/lib/site";

export const ITEMS_KEY = ["admin-items"] as const;
const EMPTY: FeaturedItemIn = { sym: "", title: "", note: "", tone: "neutral", link: "forecast", order: 0, active: true };
const LINKS: { v: ItemLink; label: string }[] = [{ v: "forecast", label: "Opens forecast" }, { v: "markets", label: "Opens Markets" }, { v: "none", label: "No link" }];
const TONES: ItemTone[] = ["bull", "neutral", "bear"];

export default function ItemsTab() {
  const { api } = useSF() as unknown as { api: SFApi };
  const qc = useQueryClient();
  const [form, setForm] = useState<FeaturedItemIn>(EMPTY);
  const [editing, setEditing] = useState<string | null>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const items = useQuery({ queryKey: ITEMS_KEY, queryFn: () => api.get<FeaturedItem[]>("/admin/items") });
  const done = (msg: string) => { toast.success(msg); qc.invalidateQueries({ queryKey: ITEMS_KEY }); qc.invalidateQueries({ queryKey: SITE_KEY }); qc.invalidateQueries({ queryKey: ["admin-history"] }); };

  const save = useMutation({
    mutationFn: (b: FeaturedItemIn) => (editing ? api.put<FeaturedItem>(`/admin/items/${editing}`, b) : api.post<FeaturedItem>("/admin/items", b)),
    onSuccess: () => { done(editing ? "Item updated" : "Item added"); setForm(EMPTY); setEditing(null); },
    onError: (e: Error) => toast.error(e.message),
  });
  const remove = useMutation({
    mutationFn: (id: string) => api.del(`/admin/items/${id}`),
    onSuccess: () => { done("Item deleted"); setConfirmId(null); },
    onError: (e: Error) => toast.error(e.message),
  });
  const toggle = useMutation({
    mutationFn: (i: FeaturedItem) => api.put<FeaturedItem>(`/admin/items/${i.id}`, { active: !i.active }),
    onSuccess: () => done("Visibility updated"),
    onError: (e: Error) => toast.error(e.message),
  });

  const edit = (i: FeaturedItem) => { setEditing(i.id); setForm({ sym: i.sym, title: i.title, note: i.note, tone: i.tone, link: i.link ?? "forecast", order: i.order, active: i.active }); };
  const set = <K extends keyof FeaturedItemIn>(k: K, v: FeaturedItemIn[K]) => setForm({ ...form, [k]: v });

  return (
    <div className="grid lg:grid-cols-[380px_1fr] gap-5">
      <form className="sf-panel p-6 space-y-3 h-fit" onSubmit={(e) => { e.preventDefault(); save.mutate(form); }} data-testid="item-form">
        <div className="lab">{editing ? "EDIT ITEM" : "NEW FEATURED ITEM"}</div>
        <p className="text-xs text-neutral-500 -mt-1">Featured items appear as highlight cards at the top of the Feed.</p>
        <div className="grid grid-cols-[110px_1fr] gap-2">
          <input className="sf-input min-w-0 uppercase" placeholder="NVDA" value={form.sym} maxLength={12} onChange={(e) => set("sym", e.target.value)} data-testid="item-sym-input" />
          <input className="sf-input min-w-0" placeholder="Title" value={form.title} maxLength={80} onChange={(e) => set("title", e.target.value)} data-testid="item-title-input" />
        </div>
        <textarea className="sf-input w-full min-h-[80px]" placeholder="Short note for members" value={form.note} maxLength={240} onChange={(e) => set("note", e.target.value)} data-testid="item-note-input" />
        <div className="flex flex-wrap items-center gap-2">
          {TONES.map((t) => <button type="button" key={t} onClick={() => set("tone", t)} className={`sf-chip ${form.tone === t ? "sf-chip-on" : ""}`} data-testid={`item-tone-${t}`}>{t}</button>)}
          <input className="sf-input w-20 !py-1.5 !text-xs ml-auto" type="number" min={0} max={999} value={form.order} onChange={(e) => set("order", Number(e.target.value) || 0)} aria-label="Order" data-testid="item-order-input" />
        </div>
        <div className="space-y-1.5">
          <span className="lab !mb-0 block">WHEN MEMBERS TAP IT</span>
          <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Item link">
            {LINKS.map((l) => <button type="button" key={l.v} role="radio" aria-checked={form.link === l.v} onClick={() => set("link", l.v)}
              className={`sf-chip ${form.link === l.v ? "sf-chip-on" : ""}`} data-testid={`item-link-${l.v}`}>{l.label}</button>)}
          </div>
        </div>
        <div className="flex gap-2 pt-1">
          <button className="sf-btn sf-btn-p flex-1" type="submit" disabled={!form.sym.trim() || !form.title.trim() || save.isPending} data-testid="item-save-button">
            <Plus size={14} />{editing ? "Save changes" : "Add item"}</button>
          {editing && <button type="button" className="sf-btn" onClick={() => { setEditing(null); setForm(EMPTY); }} data-testid="item-cancel-button"><X size={14} /></button>}
        </div>
      </form>

      <div className="space-y-2.5" data-testid="items-list">
        {items.isLoading && [0, 1, 2].map((k) => <div key={k} className="sk h-20" />)}
        {items.isError && <p className="text-sm text-neutral-500">Couldn't load items.</p>}
        {items.data?.length === 0 && <div className="sf-panel p-8 text-center text-sm text-neutral-500" data-testid="items-empty">No featured items yet — add one, or ask the AI agent to suggest some.</div>}
        {items.data?.map((i, k) => (
          <div key={i.id} className={`sf-panel p-4 flex flex-wrap sm:flex-nowrap items-center gap-4 row-in ${i.active ? "" : "opacity-55"}`} style={{ animationDelay: `${k * 40}ms` }} data-testid={`item-row-${i.id}`}>
            <span className={`sf-tone sf-tone-${i.tone}`}>{i.sym}</span>
            <div className="flex-1 min-w-0"><p className="font-medium truncate">{i.title}</p><p className="text-xs text-neutral-500 truncate">{i.note || "—"}</p></div>
            <span className="font-mono text-[10px] text-neutral-500 hidden sm:inline" data-testid={`item-link-label-${i.id}`}>{LINKS.find((l) => l.v === (i.link ?? "forecast"))?.label}</span>
            <span className="font-mono text-[10px] text-neutral-500">#{i.order}</span>
            {confirmId === i.id ? (
              <div className="flex items-center gap-2">
                <span className="text-xs bear">Delete?</span>
                <button className="sf-btn sf-btn-sm sf-btn-danger" onClick={() => remove.mutate(i.id)} data-testid={`item-delete-confirm-${i.id}`}>Delete</button>
                <button className="sf-btn sf-btn-sm" onClick={() => setConfirmId(null)} data-testid={`item-delete-cancel-${i.id}`}>Keep</button>
              </div>
            ) : (
              <div className="flex items-center gap-1.5">
                <input type="checkbox" className="sf-switch" checked={i.active} onChange={() => toggle.mutate(i)} aria-label="Visible" data-testid={`item-active-toggle-${i.id}`} />
                <button className="sf-icon-btn" onClick={() => edit(i)} aria-label="Edit" data-testid={`item-edit-${i.id}`}><Pencil size={14} /></button>
                <button className="sf-icon-btn hover:!text-red-400" onClick={() => setConfirmId(i.id)} aria-label="Delete" data-testid={`item-delete-${i.id}`}><Trash2 size={14} /></button>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

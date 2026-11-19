import { useMemo } from "react";
import { useAuth } from "@clerk/react";
import { API } from "@/lib/sfapi";

// Authenticated file download (CSV/XLSX/zip) and multipart upload.
export function useFiles() {
  const { getToken } = useAuth();
  return useMemo(() => {
    const auth = async () => ({ Authorization: `Bearer ${await getToken()}` });
    const fail = async (r) => {
      const d = await r.json().catch(() => ({}));
      throw new Error(typeof d.detail === "string" ? d.detail : `Error ${r.status}`);
    };
    const download = async (path, fallback) => {
      const r = await fetch(API + path, { headers: await auth() });
      if (!r.ok) await fail(r);
      const name = (r.headers.get("content-disposition") || "").match(/filename="(.+)"/)?.[1] || fallback;
      const url = URL.createObjectURL(await r.blob());
      Object.assign(document.createElement("a"), { href: url, download: name }).click();
      URL.revokeObjectURL(url);
    };
    const upload = async (path, file) => {
      const body = new FormData();
      body.append("file", file);
      const r = await fetch(API + path, { method: "POST", headers: await auth(), body });
      if (!r.ok) await fail(r);
      return r.json();
    };
    return { download, upload };
  }, [getToken]);
}

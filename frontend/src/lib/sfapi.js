import { useMemo } from "react";
import { useAuth } from "@clerk/react";

export const API = `${""}/api`;

export async function publicGet(path) {
  const r = await fetch(API + path);
  if (!r.ok) throw new Error(`Error ${r.status}`);
  return r.json();
}

export function useApi() {
  const { getToken } = useAuth();
  return useMemo(() => {
    const headers = async () => ({ "Content-Type": "application/json", Authorization: `Bearer ${await getToken()}` });
    const req = async (method, path, body) => {
      const r = await fetch(API + path, { method, headers: await headers(), body: body ? JSON.stringify(body) : undefined });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(typeof data.detail === "string" ? data.detail : `Error ${r.status}`);
      return data;
    };
    const stream = async (path, body, onDelta) => {
      const r = await fetch(API + path, { method: "POST", headers: await headers(), body: JSON.stringify(body || {}) });
      if (!r.ok) {
        const d = await r.json().catch(() => ({}));
        throw new Error(d.detail || `Error ${r.status}`);
      }
      const reader = r.body.getReader();
      const dec = new TextDecoder();
      let buf = "";
      let full = "";
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        const parts = buf.split("\n\n");
        buf = parts.pop();
        for (const p of parts) {
          const line = p.replace(/^data: /, "");
          if (line === "[DONE]") return full;
          const msg = JSON.parse(line);
          if (msg.error) throw new Error(msg.error);
          full += msg.delta;
          onDelta(full);
        }
      }
      return full;
    };
    return { get: (p) => req("GET", p), post: (p, b) => req("POST", p, b), put: (p, b) => req("PUT", p, b), patch: (p, b) => req("PATCH", p, b), del: (p) => req("DELETE", p), stream };
  }, [getToken]);
}

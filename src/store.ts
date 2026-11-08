import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { sendRequest, type Header, type SendResult } from "./api";
import { isThemeId, type ThemeId } from "./themes";

export interface Req {
  id: string;
  name: string;
  method: string;
  url: string;
  headers: Header[];
  body: string;
  pinned?: boolean;
}

/** A collection of requests. Each space wears its own theme. */
export interface Space {
  id: string;
  name: string;
  theme: ThemeId;
  requests: Req[];
}

export interface Outcome {
  sending: boolean;
  result?: SendResult;
  error?: string;
  /** Bumped on every reply so the response view remounts and fades in. */
  seq: number;
}

/** One space per Ctrl+1…9 shortcut. */
export const MAX_SPACES = 9;

export const METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"];
export const BODYLESS = new Set(["GET", "HEAD"]);

const uid = () => crypto.randomUUID();

function newReq(partial: Partial<Req> = {}): Req {
  return { id: uid(), name: "", method: "GET", url: "", headers: [["Accept", "application/json"]], body: "", ...partial };
}

/** What a request is called in lists: its name, else its path, else a placeholder. */
export function reqTitle(r: Req): string {
  if (r.name.trim()) return r.name;
  const u = r.url.replace(/^\w+:\/\//, "").split("?")[0];
  const path = u.slice(u.indexOf("/"));
  return (u.includes("/") && path.length > 1 ? path : u) || "New request";
}

function starter(): Space[] {
  return [
    {
      id: uid(),
      name: "Playground",
      theme: "paper",
      requests: [
        newReq({ name: "Hello httpbin", url: "https://httpbin.org/get?pond=north", pinned: true }),
        newReq({
          name: "Echo a JSON body",
          method: "POST",
          url: "https://httpbin.org/post",
          headers: [["Content-Type", "application/json"]],
          body: '{\n  "duck": "Sir Quacks-a-lot",\n  "mood": "curious"\n}',
        }),
        newReq({ name: "GitHub user", url: "https://api.github.com/users/octocat", pinned: true }),
      ],
    },
    {
      id: uid(),
      name: "Weather",
      theme: "mochi",
      requests: [newReq({ name: "Forecast", url: "https://api.open-meteo.com/v1/forecast?latitude=52.52&longitude=13.41&current=temperature_2m" })],
    },
  ];
}

/* ─── Persistence ───────────────────────────────────────────────────────── */

const KEY = "quack.workspace.v1";

interface Saved {
  spaces: Space[];
  spaceId: string;
  reqId: string;
}

const isStr = (v: unknown): v is string => typeof v === "string";
const isHeader = (h: unknown): h is Header => Array.isArray(h) && h.length === 2 && h.every(isStr);

function isReq(r: unknown): r is Req {
  const o = r as Req;
  return !!o && isStr(o.id) && isStr(o.name) && isStr(o.method) && isStr(o.url) && isStr(o.body) && Array.isArray(o.headers) && o.headers.every(isHeader);
}

/** Before themes moved onto spaces there was one global theme; carry it over. */
function legacyTheme(): ThemeId {
  try {
    const v = localStorage.getItem("quack.theme");
    if (isThemeId(v)) return v;
  } catch {
    // Fall through to the default.
  }
  return "paper";
}

/** Reads the saved workspace, dropping anything malformed instead of crashing on it. */
function load(): Saved {
  try {
    const s = JSON.parse(localStorage.getItem(KEY) ?? "null") as Saved | null;
    const spaces = (Array.isArray(s?.spaces) ? s.spaces : [])
      .filter((sp) => sp && isStr(sp.id) && isStr(sp.name) && Array.isArray(sp.requests))
      .slice(0, MAX_SPACES)
      .map((sp): Space => {
        const requests = sp.requests.filter(isReq);
        return {
          id: sp.id,
          name: sp.name,
          theme: isThemeId(sp.theme) ? sp.theme : legacyTheme(),
          requests: requests.length ? requests : [newReq()],
        };
      });
    if (s && spaces.length) return { spaces, spaceId: s.spaceId, reqId: s.reqId };
  } catch {
    // Corrupt or unavailable storage: start fresh.
  }
  const spaces = starter();
  return { spaces, spaceId: spaces[0].id, reqId: spaces[0].requests[0].id };
}

/* ─── Store ─────────────────────────────────────────────────────────────── */

export function useWorkspaceState() {
  const [saved, setSaved] = useState(load);
  const [outcomes, setOutcomes] = useState<Record<string, Outcome>>({});

  useEffect(() => {
    const t = setTimeout(() => {
      try {
        localStorage.setItem(KEY, JSON.stringify(saved));
      } catch {
        // Not fatal: changes just won't persist this time.
      }
    }, 250);
    return () => clearTimeout(t);
  }, [saved]);

  const { spaces } = saved;
  const space = spaces.find((s) => s.id === saved.spaceId) ?? spaces[0];
  const req = space.requests.find((r) => r.id === saved.reqId) ?? space.requests[0];

  const actions = useMemo(() => {
    const mapSpace = (id: string, f: (s: Space) => Space) => setSaved((st) => ({ ...st, spaces: st.spaces.map((s) => (s.id === id ? f(s) : s)) }));

    return {
      selectSpace(id: string) {
        setSaved((st) => {
          const sp = st.spaces.find((s) => s.id === id);
          return sp ? { ...st, spaceId: id, reqId: sp.requests[0].id } : st;
        });
      },
      selectReq(spaceId: string, reqId: string) {
        setSaved((st) => ({ ...st, spaceId, reqId }));
      },
      updateReq(id: string, patch: Partial<Req>) {
        setSaved((st) => ({
          ...st,
          spaces: st.spaces.map((s) => ({ ...s, requests: s.requests.map((r) => (r.id === id ? { ...r, ...patch } : r)) })),
        }));
      },
      addReq() {
        const r = newReq();
        setSaved((st) => ({
          ...st,
          reqId: r.id,
          spaces: st.spaces.map((s) => (s.id === st.spaceId ? { ...s, requests: [...s.requests, r] } : s)),
        }));
      },
      duplicateReq(id: string) {
        const copyId = uid();
        setSaved((st) => ({
          ...st,
          reqId: copyId,
          spaces: st.spaces.map((s) => {
            const i = s.requests.findIndex((r) => r.id === id);
            if (i < 0) return s;
            const src = s.requests[i];
            const requests = [...s.requests];
            requests.splice(i + 1, 0, { ...src, id: copyId, name: src.name && `${src.name} copy`, pinned: false });
            return { ...s, requests };
          }),
        }));
      },
      deleteReq(id: string) {
        setSaved((st) => {
          // A space is never left empty; it gets a fresh blank request instead.
          const spaces = st.spaces.map((s) => {
            const requests = s.requests.filter((r) => r.id !== id);
            return { ...s, requests: requests.length ? requests : [newReq()] };
          });
          const cur = spaces.find((s) => s.id === st.spaceId) ?? spaces[0];
          const keep = cur.requests.some((r) => r.id === st.reqId);
          return { ...st, spaces, reqId: keep ? st.reqId : cur.requests[0].id };
        });
      },
      addSpace() {
        setSaved((st) => {
          if (st.spaces.length >= MAX_SPACES) return st;
          const r = newReq();
          const theme = (st.spaces.find((s) => s.id === st.spaceId) ?? st.spaces[0]).theme;
          const sp: Space = { id: uid(), name: `Space ${st.spaces.length + 1}`, theme, requests: [r] };
          return { spaces: [...st.spaces, sp], spaceId: sp.id, reqId: r.id };
        });
      },
      renameSpace(id: string, name: string) {
        mapSpace(id, (s) => ({ ...s, name }));
      },
      setSpaceTheme(id: string, theme: ThemeId) {
        mapSpace(id, (s) => ({ ...s, theme }));
      },
      setAllThemes(theme: ThemeId) {
        setSaved((st) => ({ ...st, spaces: st.spaces.map((s) => ({ ...s, theme })) }));
      },
      deleteSpace(id: string) {
        setSaved((st) => {
          if (st.spaces.length < 2) return st;
          const spaces = st.spaces.filter((s) => s.id !== id);
          if (st.spaceId !== id) return { ...st, spaces };
          return { spaces, spaceId: spaces[0].id, reqId: spaces[0].requests[0].id };
        });
      },
    };
  }, []);

  async function send(r: Req = req) {
    if (!r.url.trim() || outcomes[r.id]?.sending) return;
    const seq = (outcomes[r.id]?.seq ?? 0) + 1;
    setOutcomes((o) => ({ ...o, [r.id]: { ...o[r.id], sending: true, seq: o[r.id]?.seq ?? 0 } }));
    try {
      const result = await sendRequest({
        method: r.method,
        url: r.url,
        headers: r.headers.filter(([k]) => k.trim()),
        body: BODYLESS.has(r.method) ? undefined : r.body,
        timeoutMs: 30_000,
      });
      setOutcomes((o) => ({ ...o, [r.id]: { sending: false, result, seq } }));
    } catch (e) {
      setOutcomes((o) => ({ ...o, [r.id]: { sending: false, error: String(e), seq } }));
    }
  }

  return { spaces, space, req, outcome: outcomes[req.id] as Outcome | undefined, send, ...actions };
}

export type Workspace = ReturnType<typeof useWorkspaceState>;
export const WorkspaceContext = createContext<Workspace | null>(null);

export function useWorkspace(): Workspace {
  const ws = useContext(WorkspaceContext);
  if (!ws) throw new Error("useWorkspace must be used inside WorkspaceContext");
  return ws;
}

/* ─── Query params ⇄ URL ────────────────────────────────────────────────── */

function decode(s: string) {
  try {
    return decodeURIComponent(s.replace(/\+/g, " "));
  } catch {
    return s;
  }
}

const encode = (s: string) => encodeURIComponent(s).replace(/%2F/g, "/").replace(/%3A/g, ":").replace(/%2C/g, ",");

export function parseParams(url: string): Header[] {
  const q = url.indexOf("?");
  if (q < 0) return [];
  return url
    .slice(q + 1)
    .split("#")[0]
    .split("&")
    .filter(Boolean)
    .map((pair) => {
      const [k, ...v] = pair.split("=");
      return [decode(k), decode(v.join("="))];
    });
}

export function withParams(url: string, params: Header[]): string {
  const base = url.split("?")[0].split("#")[0];
  const hash = url.includes("#") ? url.slice(url.indexOf("#")) : "";
  const qs = params
    .filter(([k, v]) => k || v)
    .map(([k, v]) => (v === "" ? encode(k) : `${encode(k)}=${encode(v)}`))
    .join("&");
  return base + (qs ? `?${qs}` : "") + hash;
}

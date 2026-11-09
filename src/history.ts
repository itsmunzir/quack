import type { SendResult } from "./api";
import type { Req } from "./store";

/** One sent request: what was sent (before variables) and what came back. */
export interface HistoryEntry {
  id: string;
  at: number;
  spaceId: string;
  req: Req;
  result?: SendResult;
  error?: string;
}

const KEY = "quack.history.v1";
export const MAX_HISTORY = 100;
/** Bodies larger than this live for the session only, so storage stays small. */
const MAX_KEPT_BODY = 32 * 1024;

const isStr = (v: unknown): v is string => typeof v === "string";

function isEntry(e: unknown): e is HistoryEntry {
  const o = e as HistoryEntry;
  const r = o?.result;
  return (
    !!o &&
    isStr(o.id) &&
    isStr(o.spaceId) &&
    typeof o.at === "number" &&
    !!o.req &&
    isStr(o.req.id) &&
    isStr(o.req.method) &&
    isStr(o.req.url) &&
    (r === undefined || (typeof r.status === "number" && isStr(r.body) && Array.isArray(r.headers)))
  );
}

export function loadHistory(): HistoryEntry[] {
  try {
    const list: unknown = JSON.parse(localStorage.getItem(KEY) ?? "[]");
    return Array.isArray(list) ? list.filter(isEntry).slice(0, MAX_HISTORY) : [];
  } catch {
    return [];
  }
}

export function saveHistory(list: HistoryEntry[]) {
  const slim = list.map((h) => {
    if (!h.result) return h;
    // Images and big bodies stay in memory only; storage is small.
    const { image: _, ...result } = h.result;
    return result.body.length > MAX_KEPT_BODY ? { ...h, result: { ...result, body: `(The ${Math.round(result.body.length / 1024)} KB body is not kept between sessions.)` } } : { ...h, result };
  });
  try {
    localStorage.setItem(KEY, JSON.stringify(slim));
  } catch {
    // Not fatal: history just won't persist this time.
  }
}

/** "now", "5m", "3h", "2d": compact time since a moment. */
export function ago(at: number, now = Date.now()) {
  const s = Math.max(0, (now - at) / 1000);
  if (s < 45) return "now";
  if (s < 3600) return `${Math.round(s / 60)}m`;
  if (s < 86400) return `${Math.round(s / 3600)}h`;
  return `${Math.round(s / 86400)}d`;
}

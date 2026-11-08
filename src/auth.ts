import type { Header } from "./api";

export type Auth =
  | { type: "bearer"; token: string }
  | { type: "basic"; user: string; pass: string }
  | { type: "apikey"; key: string; value: string; in: "header" | "query" };

export type AuthType = Auth["type"] | "none";

export const AUTH_TYPES: readonly { id: AuthType; name: string }[] = [
  { id: "none", name: "None" },
  { id: "bearer", name: "Bearer" },
  { id: "basic", name: "Basic" },
  { id: "apikey", name: "API key" },
];

/** A blank auth of the given kind, keeping the old secret where the field carries over. */
export function blankAuth(type: AuthType, prev?: Auth): Auth | undefined {
  const secret = prev?.type === "bearer" ? prev.token : prev?.type === "basic" ? prev.pass : prev?.type === "apikey" ? prev.value : "";
  if (type === "bearer") return { type, token: secret };
  if (type === "basic") return { type, user: "", pass: secret };
  if (type === "apikey") return { type, key: "X-API-Key", value: secret, in: "header" };
  return undefined;
}

const isStr = (v: unknown): v is string => typeof v === "string";

/** Validates auth read back from storage. */
export function isAuth(a: unknown): a is Auth {
  const o = a as Record<string, unknown> | null;
  if (!o || typeof o !== "object") return false;
  if (o.type === "bearer") return isStr(o.token);
  if (o.type === "basic") return isStr(o.user) && isStr(o.pass);
  if (o.type === "apikey") return isStr(o.key) && isStr(o.value) && (o.in === "header" || o.in === "query");
  return false;
}

/** UTF-8 safe base64, for Basic credentials. */
function base64(s: string) {
  return btoa(Array.from(new TextEncoder().encode(s), (b) => String.fromCharCode(b)).join(""));
}

/** Folds auth into the headers or URL, replacing any header of the same name. Variables must already be filled in. */
export function withAuth<R extends { url: string; headers: Header[]; auth?: Auth }>(r: R): R {
  const a = r.auth;
  if (!a) return r;
  const set = (name: string, value: string) => ({ ...r, headers: [...r.headers.filter(([k]) => k.trim().toLowerCase() !== name.toLowerCase()), [name, value] as Header] });
  if (a.type === "bearer") return a.token ? set("Authorization", `Bearer ${a.token}`) : r;
  if (a.type === "basic") return a.user || a.pass ? set("Authorization", `Basic ${base64(`${a.user}:${a.pass}`)}`) : r;
  if (!a.key) return r;
  if (a.in === "header") return set(a.key, a.value);
  const [base, hash = ""] = r.url.split("#");
  const pair = `${encodeURIComponent(a.key)}=${encodeURIComponent(a.value)}`;
  return { ...r, url: `${base}${base.includes("?") ? "&" : "?"}${pair}${hash && `#${hash}`}` };
}

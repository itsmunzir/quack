import type { Header } from "./api";
import { withAuth, type Auth } from "./auth";

/** `{{name}}`, with optional spaces inside the braces. */
const VAR = /\{\{\s*([\w.-]+)\s*\}\}/g;

export const hasVars = (text: string) => text.search(VAR) >= 0;

/** Fills `{{name}}` from the variables; unknown names are left as written and reported. */
export function resolve(text: string, vars: Header[]): { text: string; missing: string[] } {
  const known = new Map(vars.filter(([k]) => k.trim()).map(([k, v]) => [k.trim(), v]));
  const missing = new Set<string>();
  const out = text.replace(VAR, (whole, name: string) => {
    const v = known.get(name);
    if (v === undefined) missing.add(name);
    return v ?? whole;
  });
  return { text: out, missing: [...missing] };
}

type Fillable = { url: string; headers: Header[]; body: string; auth?: Auth };

/** A request with every variable filled in. */
export function withEnv<R extends Fillable>(r: R, vars: Header[]): R {
  const fill = (s: string) => resolve(s, vars).text;
  const auth = r.auth && (Object.fromEntries(Object.entries(r.auth).map(([k, v]) => [k, k === "type" || k === "in" ? v : fill(v)])) as Auth);
  return { ...r, url: fill(r.url), headers: r.headers.map(([k, v]) => [fill(k), fill(v)] as Header), body: fill(r.body), auth };
}

/** Exactly what goes on the wire: variables filled in first, then auth folded into headers or the URL. */
export const prepare = <R extends Fillable>(r: R, vars: Header[]): R => withAuth(withEnv(r, vars));

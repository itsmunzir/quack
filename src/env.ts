import type { Header } from "./api";

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

/** A request with every variable filled in, ready to send or export. */
export function withEnv<R extends { url: string; headers: Header[]; body: string }>(r: R, vars: Header[]): R {
  const fill = (s: string) => resolve(s, vars).text;
  return { ...r, url: fill(r.url), headers: r.headers.map(([k, v]) => [fill(k), fill(v)] as Header), body: fill(r.body) };
}

import type { Header } from "./api";
import type { FormPart } from "./api";
import type { Auth } from "./auth";
import type { FormField } from "./body";
import type { Req } from "./store";

type Parsed = Pick<Req, "method" | "url" | "headers" | "body" | "auth" | "bodyType" | "form">;

/** Splits a shell command into words, honouring quotes and line continuations (bash `\` and cmd `^`). */
function words(cmd: string): string[] {
  const out: string[] = [];
  let cur = "";
  let quote: "'" | '"' | null = null;
  let started = false;
  const src = cmd.replace(/[\\^]\r?\n/g, " ");
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (quote) {
      if (c === quote) quote = null;
      else if (c === "\\" && quote === '"' && /["\\$`]/.test(src[i + 1] ?? "")) cur += src[++i];
      else cur += c;
    } else if (c === "'" || c === '"') {
      quote = c;
      started = true;
    } else if (c === "$" && src[i + 1] === "'") {
      // Bash ANSI-C quoting, as Chrome emits: $'…' with \n, \t and \' escapes.
      i += 2;
      while (i < src.length && src[i] !== "'") {
        if (src[i] === "\\" && i + 1 < src.length) {
          const e = src[++i];
          cur += e === "n" ? "\n" : e === "t" ? "\t" : e === "r" ? "\r" : e;
        } else cur += src[i];
        i++;
      }
      started = true;
    } else if (c === "\\" && i + 1 < src.length) {
      cur += src[++i];
      started = true;
    } else if (/\s/.test(c)) {
      if (started || cur) out.push(cur);
      cur = "";
      started = false;
    } else {
      cur += c;
      started = true;
    }
  }
  if (started || cur) out.push(cur);
  return out;
}

const DATA_FLAGS = new Set(["-d", "--data", "--data-raw", "--data-binary", "--data-ascii", "--data-urlencode"]);
/** Flags that take a value we don't use. */
const SKIP_WITH_VALUE = new Set(["-o", "--output", "-m", "--max-time", "--connect-timeout", "-x", "--proxy", "-w", "--write-out", "-c", "--cookie-jar", "--retry"]);

export const isCurl = (text: string) => /^\s*curl(\.exe)?\s/i.test(text);

/** Turns a `curl …` command into a request, or null if it isn't one. */
export function parseCurl(cmd: string): Parsed | null {
  const w = words(cmd.trim());
  if (!/^curl(\.exe)?$/i.test(w[0] ?? "")) return null;
  let method = "";
  let url = "";
  const headers: Header[] = [];
  const data: string[] = [];
  let asQuery = false;
  let auth: Auth | undefined;
  const form: FormField[] = [];

  for (let i = 1; i < w.length; i++) {
    let flag = w[i];
    let value: string | undefined;
    // --flag=value and -Xvalue forms.
    const eq = flag.startsWith("--") ? flag.indexOf("=") : -1;
    if (eq > 0) [flag, value] = [flag.slice(0, eq), flag.slice(eq + 1)];
    else if (/^-[XHdubAe]./.test(flag)) [flag, value] = [flag.slice(0, 2), flag.slice(2)];
    const next = () => value ?? w[++i] ?? "";

    if (flag === "-X" || flag === "--request") method = next().toUpperCase();
    else if (flag === "-H" || flag === "--header") {
      const h = next();
      const c = h.indexOf(":");
      if (c <= 0) continue;
      const [name, value] = [h.slice(0, c).trim(), h.slice(c + 1).trim()];
      const bearer = /^authorization$/i.test(name) && value.match(/^Bearer\s+(.+)$/i);
      if (bearer) auth = { type: "bearer", token: bearer[1] };
      else headers.push([name, value]);
    } else if (DATA_FLAGS.has(flag)) data.push(next());
    else if (flag === "-F" || flag === "--form") {
      // name=value, or name=@path for a file; drop ;type=… and similar suffixes.
      const f = next();
      const eq = f.indexOf("=");
      if (eq <= 0) continue;
      const [name, value] = [f.slice(0, eq), f.slice(eq + 1)];
      const file = value.startsWith("@");
      form.push({ name, value: (file ? value.slice(1) : value).split(";")[0], file: file || undefined });
    }
    else if (flag === "--json") {
      data.push(next());
      headers.push(["Content-Type", "application/json"], ["Accept", "application/json"]);
    } else if (flag === "-u" || flag === "--user") {
      const [user, ...pass] = next().split(":");
      auth = { type: "basic", user, pass: pass.join(":") };
    }
    else if (flag === "-A" || flag === "--user-agent") headers.push(["User-Agent", next()]);
    else if (flag === "-b" || flag === "--cookie") headers.push(["Cookie", next()]);
    else if (flag === "-e" || flag === "--referer") headers.push(["Referer", next()]);
    else if (flag === "-G" || flag === "--get") asQuery = true;
    else if (flag === "-I" || flag === "--head") method = "HEAD";
    else if (flag === "--url") url = next();
    else if (SKIP_WITH_VALUE.has(flag)) next();
    else if (!flag.startsWith("-") && !url) url = flag;
  }
  if (!url) return null;

  let body = data.join("&");
  if (asQuery && body) {
    url += (url.includes("?") ? "&" : "?") + body;
    body = "";
  }
  if (form.length) return { method: method || "POST", url, headers: headers.filter(([k]) => k.toLowerCase() !== "content-type"), body: "", auth, bodyType: "multipart", form };
  if (!method) method = body ? "POST" : "GET";
  // Pretty-print JSON bodies so they are pleasant to edit.
  try {
    if (body && /^[[{]/.test(body.trim())) body = JSON.stringify(JSON.parse(body), null, 2);
  } catch {
    // Not JSON; keep it as sent.
  }
  return { method, url, headers, body, auth };
}

const sh = (s: string) => `'${s.replace(/'/g, `'\\''`)}'`;

/** The request as a copy-pasteable bash `curl` command. */
export function toCurl(r: Parsed & { multipart?: FormPart[] }, sendBody: boolean): string {
  const multipart = sendBody ? r.multipart : undefined;
  const implicitPost = r.method === "POST" && sendBody && (r.body || multipart?.length);
  const parts = [`curl ${sh(r.url)}`];
  if (r.method !== "GET" && !implicitPost) parts.push(`-X ${r.method}`);
  for (const [k, v] of r.headers) if (k.trim() && !(multipart && k.trim().toLowerCase() === "content-type")) parts.push(`-H ${sh(`${k}: ${v}`)}`);
  if (multipart) for (const p of multipart) parts.push(`-F ${sh(`${p.name}=${p.file ? "@" : ""}${p.value}`)}`);
  else if (sendBody && r.body) parts.push(`--data-raw ${sh(r.body)}`);
  return parts.join(" \\\n  ");
}

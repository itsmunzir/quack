import type { Header } from "./api";
import type { Auth } from "./auth";
import { pathParts, type Capture } from "./capture";
import { newReq, type Req } from "./store";

/*
 * `.http` and `.rest` files, as written for VS Code's REST Client and JetBrains' HTTP Client:
 *
 *   @host = https://api.pond.io
 *
 *   ### Sign in
 *   # @name login
 *   POST {{host}}/login
 *   Content-Type: application/json
 *
 *   { "user": "duck" }
 *
 *   ### Me
 *   GET {{host}}/me
 *   Authorization: Bearer {{login.response.body.$.token}}
 *
 * Response references like the one above, and JetBrains `client.global.set(...)` handlers, become
 * captures, so the chain still works in Quack.
 */

export interface HttpFile {
  requests: Req[];
  vars: Header[];
}

const METHODS = "GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS|TRACE|CONNECT";
const REQUEST_LINE = new RegExp(`^(?:(${METHODS})\\s+)?((?:https?://|\\{\\{|/)\\S*.*?)(?:\\s+HTTP/[\\d.]+)?\\s*$`, "i");
const COMMENT = /^\s*(?:#|\/\/)/;
const FILE_VAR = /^\s*@([\w.-]+)\s*=\s*(.*?)\s*$/;
const NAME = /^\s*(?:#|\/\/)\s*@name\s+([\w.-]+)/;

/** Looks like a `.http` file: some line is a request line, and it isn't JSON or YAML-shaped data. */
export const looksLikeHttpFile = (text: string) =>
  text.split(/\r?\n/).some((l) => new RegExp(`^(${METHODS})\\s+(https?://|\\{\\{|/)`, "i").test(l.trim())) && !/^\s*[[{]/.test(text);

function basic(value: string): Auth | undefined {
  const rest = value.replace(/^Basic\s+/i, "").trim();
  // REST Client writes `Basic user:pass` or `Basic user pass` and encodes it for you.
  const plain = rest.match(/^(\S+?)(?::|\s+)(.*)$/);
  if (plain) return { type: "basic", user: plain[1], pass: plain[2] };
  try {
    const [user, ...pass] = atob(rest).split(":");
    if (pass.length) return { type: "basic", user, pass: pass.join(":") };
  } catch {
    // Not base64: leave the header as written.
  }
  return undefined;
}

/** A variable name for a value read from a named request's response, like `login_token`. */
function varFor(request: string, from: Capture["from"], path: string): string {
  const parts = from === "header" ? [path] : pathParts(path);
  const leaf = String(parts.at(-1) ?? "body").replace(/[^\w.-]+/g, "_");
  return `${request}_${leaf}`;
}

/** Reads JetBrains response-handler lines like `client.global.set("token", response.body.token)`. */
function handlerCaptures(script: string): Capture[] {
  const out: Capture[] = [];
  const set = String.raw`client\.global\.set\(\s*["']([\w.-]+)["']\s*,\s*`;
  const path = String.raw`((?:\.\w+|\[\s*\d+\s*\]|\[\s*["'][^"'\]]+["']\s*\])*)`;
  for (const m of script.matchAll(new RegExp(`${set}response\\.body${path}\\s*\\)`, "g"))) out.push({ name: m[1], from: "body", path: m[2].replace(/^\./, "") });
  for (const m of script.matchAll(new RegExp(String.raw`${set}response\.headers\.valueOf\(\s*["']([^"']+)["']\s*\)\s*\)`, "g"))) out.push({ name: m[1], from: "header", path: m[2] });
  return out;
}

export function parseHttpFile(text: string): HttpFile {
  const vars: Header[] = [];
  const requests: Req[] = [];
  const named = new Map<string, Req>();

  const blocks: { title: string; lines: string[] }[] = [{ title: "", lines: [] }];
  for (const line of text.split(/\r?\n/)) {
    const sep = line.match(/^###\s*(.*)$/);
    if (sep) blocks.push({ title: sep[1].trim(), lines: [] });
    else blocks.at(-1)!.lines.push(line);
  }

  for (const { title, lines } of blocks) {
    let i = 0;
    let name = "";
    // Before the request line: comments, the request's @name, and file variables.
    for (; i < lines.length; i++) {
      const l = lines[i];
      const n = l.match(NAME);
      if (n) name = n[1];
      const v = l.match(FILE_VAR);
      if (v) vars.push([v[1], v[2]]);
      if (!l.trim() || COMMENT.test(l) || v) continue;
      break;
    }
    const start = lines[i]?.trim().match(REQUEST_LINE);
    if (!start) continue;
    let url = start[2].trim();
    const method = (start[1] ?? "GET").toUpperCase();
    i++;
    // REST Client lets a long query continue on lines that start with ? or &.
    for (; i < lines.length && /^\s*[?&]/.test(lines[i]); i++) url += lines[i].trim();

    const headers: Header[] = [];
    let auth: Auth | undefined;
    for (; i < lines.length && lines[i].trim(); i++) {
      if (COMMENT.test(lines[i])) continue;
      const h = lines[i].match(/^\s*([^:\s][^:]*?)\s*:\s?(.*)$/);
      if (!h) continue;
      const [, key, value] = h;
      if (/^authorization$/i.test(key) && /^Bearer\s+/i.test(value)) auth = { type: "bearer", token: value.replace(/^Bearer\s+/i, "").trim() };
      else if (/^authorization$/i.test(key) && /^Basic\s+/i.test(value) && basic(value)) auth = basic(value);
      else headers.push([key, value]);
    }

    // The body runs to the end of the block, less any response handler and redirect lines.
    const body: string[] = [];
    let script = "";
    for (i++; i < lines.length; i++) {
      const l = lines[i];
      if (/^>\s*\{%/.test(l)) {
        let j = i;
        let chunk = l.replace(/^>\s*\{%/, "");
        while (!chunk.includes("%}") && j + 1 < lines.length) chunk += "\n" + lines[++j];
        script += chunk.replace(/%\}[\s\S]*$/, "") + "\n";
        i = j;
        continue;
      }
      if (/^(?:>|<>)\s+\S/.test(l)) continue;
      body.push(l);
    }
    while (body.length && !body.at(-1)!.trim()) body.pop();
    while (body.length && !body[0].trim()) body.shift();

    const captures = handlerCaptures(script);
    const req = newReq({ name: title || name, method, url, headers, body: body.join("\n"), auth, captures: captures.length ? captures : undefined });
    requests.push(req);
    if (name) named.set(name, req);
  }

  // `{{login.response.body.$.token}}` becomes `{{login_token}}`, captured by the login request.
  const ref = /\{\{\s*([\w-]+)\.response\.(body|headers)\.([^}]*?)\s*\}\}/g;
  const rewrite = (s: string) =>
    s.replace(ref, (whole, reqName: string, part: string, path: string) => {
      const source = named.get(reqName);
      if (!source) return whole;
      const from: Capture["from"] = part === "headers" ? "header" : "body";
      const capturePath = from === "body" ? (path.trim() === "*" ? "" : path.trim().replace(/^\$\.?/, "")) : path.trim();
      const varName = varFor(reqName, from, capturePath || "body");
      const list = (source.captures ??= []);
      if (!list.some((c) => c.name === varName)) list.push({ name: varName, from, path: capturePath });
      return `{{${varName}}}`;
    });
  for (const r of requests) {
    r.url = rewrite(r.url);
    r.headers = r.headers.map(([k, v]) => [k, rewrite(v)]);
    r.body = rewrite(r.body);
    if (r.auth) r.auth = Object.fromEntries(Object.entries(r.auth).map(([k, v]) => [k, rewrite(v)])) as Auth;
  }
  return { requests, vars };
}

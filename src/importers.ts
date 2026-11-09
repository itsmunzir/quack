import yaml from "js-yaml";
import type { Header } from "./api";
import type { Auth } from "./auth";
import type { BodyType, FormField } from "./body";
import type { Capture } from "./capture";
import { looksLikeHttpFile, parseHttpFile } from "./httpfile";
import { cleanSpaces, newReq, uid, type Env, type Req, type Space } from "./store";
import { DEFAULT_THEME } from "./themes";

/** The file Quack writes for a backup or a shared space. */
export const BACKUP_FORMAT = "quack-backup";

export function toBackup(spaces: Space[]): string {
  return JSON.stringify({ format: BACKUP_FORMAT, version: 1, exportedAt: new Date().toISOString(), spaces }, null, 2);
}

export interface Imported {
  kind: "Quack backup" | "Postman collection" | "OpenAPI spec" | ".http file";
  spaces: Space[];
}

/**
 * Reads a Quack backup, Postman collection or OpenAPI/Swagger spec (JSON or YAML), or a `.http` file.
 * `fileName` names a `.http` file's space. Throws a readable error for anything else.
 */
export function importText(text: string, fileName = ""): Imported {
  const httpFile = (): Imported => {
    const { requests, vars } = parseHttpFile(text);
    if (!requests.length) throw new Error("There are no requests in that file.");
    return { kind: ".http file", spaces: [space(fileName.replace(/\.(http|rest)$/i, "") || "HTTP requests", requests, vars)] };
  };
  if (/\.(http|rest)$/i.test(fileName)) return httpFile();
  // Otherwise a .http file is only guessed at once the text isn't a collection, so a spec that
  // mentions `GET /users` in a description is never mistaken for one.
  const notACollection = (message: string) => {
    if (looksLikeHttpFile(text)) return httpFile();
    throw new Error(message);
  };
  let doc: Record<string, unknown>;
  try {
    // JSON is valid YAML, but the JSON parser is faster and stricter, so try it first.
    doc = JSON.parse(text);
  } catch {
    try {
      // The core schema builds plain data only: no custom types, and dates stay as written.
      doc = yaml.load(text, { schema: yaml.CORE_SCHEMA }) as Record<string, unknown>;
    } catch {
      return notACollection("That file isn't valid JSON or YAML.");
    }
  }
  if (!doc || typeof doc !== "object") return notACollection("That file isn't a collection Quack knows.");
  if (doc.format === BACKUP_FORMAT) {
    const spaces = cleanSpaces(doc.spaces);
    if (!spaces.length) throw new Error("That backup has no spaces in it.");
    return { kind: "Quack backup", spaces };
  }
  const info = doc.info as { schema?: string } | undefined;
  if (typeof info?.schema === "string" && info.schema.includes("getpostman.com")) return { kind: "Postman collection", spaces: [postman(doc as unknown as PmCollection)] };
  if (typeof doc.openapi === "string" || typeof doc.swagger === "string") return { kind: "OpenAPI spec", spaces: [openapi(doc as unknown as OasDoc)] };
  return notACollection("That file isn't a Postman collection, OpenAPI spec, .http file or Quack backup.");
}

const space = (name: string, requests: Req[], vars: Header[]): Space => {
  const envs: Env[] = vars.length ? [{ id: uid(), name: "Imported", vars }] : [];
  return { id: uid(), name: name.trim().slice(0, 60) || "Imported", theme: DEFAULT_THEME, requests: requests.length ? requests : [newReq()], envs, envId: envs[0]?.id ?? null };
};

const str = (v: unknown) => (typeof v === "string" ? v : v == null ? "" : String(v));

/* ─── Postman (v2.0 / v2.1) ─────────────────────────────────────────────── */

interface PmKV {
  key?: string;
  value?: unknown;
  src?: unknown;
  type?: string;
  disabled?: boolean;
}
interface PmAuth {
  type?: string;
  bearer?: PmKV[];
  basic?: PmKV[];
  apikey?: PmKV[];
}
interface PmRequest {
  method?: string;
  url?: string | { raw?: string; host?: string[] | string; path?: string[] | string };
  header?: PmKV[] | string;
  body?: { mode?: string; raw?: string; urlencoded?: PmKV[]; formdata?: PmKV[] };
  auth?: PmAuth;
}
interface PmItem {
  name?: string;
  event?: { listen?: string; script?: { exec?: string[] | string } }[];
  item?: PmItem[];
  request?: PmRequest | string;
  auth?: PmAuth;
}
interface PmCollection {
  info: { name?: string };
  item?: PmItem[];
  auth?: PmAuth;
  variable?: PmKV[];
}

const enabled = (list: unknown): PmKV[] => (Array.isArray(list) ? list.filter((kv: PmKV) => kv && !kv.disabled) : []);
const pick = (list: PmKV[] | undefined, key: string) => str(enabled(list).find((kv) => kv.key === key)?.value);

function pmAuth(a: PmAuth | undefined): Auth | undefined | null {
  if (!a?.type) return null; // Not set here: inherit from the parent.
  if (a.type === "bearer") return { type: "bearer", token: pick(a.bearer, "token") };
  if (a.type === "basic") return { type: "basic", user: pick(a.basic, "username"), pass: pick(a.basic, "password") };
  if (a.type === "apikey") return { type: "apikey", key: pick(a.apikey, "key"), value: pick(a.apikey, "value"), in: pick(a.apikey, "in") === "query" ? "query" : "header" };
  return undefined; // noauth, or a kind Quack doesn't do.
}

function pmUrl(u: PmRequest["url"]): string {
  if (typeof u === "string") return u;
  if (u?.raw) return u.raw;
  const join = (p: string[] | string | undefined, sep: string) => (Array.isArray(p) ? p.join(sep) : str(p));
  return u ? `${join(u.host, ".")}/${join(u.path, "/")}` : "";
}

/** A JSON path after the body, like `.data.items[0]["odd key"]`. */
const JS_PATH = String.raw`((?:\.\w+|\[\s*\d+\s*\]|\[\s*["'][^"'\]]+["']\s*\])*)`;
/** The start of a call that saves a variable: `pm.environment.set("name", ` and friends. */
const JS_SET = String.raw`(?:pm\.(?:environment|collectionVariables|globals|variables)\.set|postman\.set(?:Environment|Global)Variable)\(\s*["'\x60]([\w.-]+)["'\x60]\s*,\s*`;

/**
 * Turns the common test-script lines that save part of a response into captures, such as
 * `pm.environment.set("token", pm.response.json().data.token)`. Anything cleverer is left behind.
 */
export function pmCaptures(events: PmItem["event"]): Capture[] | undefined {
  const script = (Array.isArray(events) ? events : [])
    .filter((e) => e?.listen === "test")
    .map((e) => (Array.isArray(e.script?.exec) ? e.script.exec.join("\n") : str(e.script?.exec)))
    .join("\n");
  if (!script) return undefined;
  // Names that hold the parsed body, like `const data = pm.response.json();`
  const aliases = [...script.matchAll(/(?:var|let|const)\s+(\w+)\s*=\s*(?:pm\.response\.json\(\)|JSON\.parse\(\s*responseBody\s*\))/g)].map((m) => m[1]);
  const body = [String.raw`pm\.response\.json\(\)`, String.raw`JSON\.parse\(\s*responseBody\s*\)`, ...aliases.map((a) => `\\b${a}\\b`)].join("|");
  const out: Capture[] = [];
  for (const m of script.matchAll(new RegExp(`${JS_SET}(?:${body})${JS_PATH}\\s*\\)`, "g"))) out.push({ name: m[1], from: "body", path: m[2].replace(/^\./, "") });
  const header = String.raw`pm\.response\.headers\.get\(\s*["'\x60]([^"'\x60]+)["'\x60]\s*\)\s*\)`;
  for (const m of script.matchAll(new RegExp(JS_SET + header, "g"))) out.push({ name: m[1], from: "header", path: m[2] });
  return out.length ? out : undefined;
}

function postman(c: PmCollection): Space {
  const requests: Req[] = [];
  const walk = (items: PmItem[] | undefined, prefix: string, inherited: Auth | undefined) => {
    for (const it of Array.isArray(items) ? items : []) {
      const own = pmAuth(it.auth);
      const auth = own === null ? inherited : own;
      const name = str(it.name);
      if (Array.isArray(it.item)) {
        walk(it.item, `${prefix}${name} / `, auth);
        continue;
      }
      const r: PmRequest = typeof it.request === "string" ? { url: it.request } : (it.request ?? {});
      const reqAuth = pmAuth(r.auth);
      const body = r.body;
      let bodyType: BodyType | undefined;
      let form: FormField[] | undefined;
      if (body?.mode === "urlencoded") {
        bodyType = "form";
        form = enabled(body.urlencoded).map((kv) => ({ name: str(kv.key), value: str(kv.value) }));
      } else if (body?.mode === "formdata") {
        bodyType = "multipart";
        form = enabled(body.formdata).map((kv) =>
          kv.type === "file" ? { name: str(kv.key), value: str(Array.isArray(kv.src) ? kv.src[0] : kv.src), file: true } : { name: str(kv.key), value: str(kv.value) },
        );
      }
      requests.push(
        newReq({
          name: `${prefix}${name}`,
          method: str(r.method || "GET").toUpperCase(),
          url: pmUrl(r.url),
          headers: Array.isArray(r.header) ? enabled(r.header).map((h): Header => [str(h.key), str(h.value)]) : [],
          body: body?.mode === "raw" ? str(body.raw) : "",
          bodyType,
          form,
          auth: (reqAuth === null ? auth : reqAuth) ?? undefined,
          captures: pmCaptures(it.event),
        }),
      );
    }
  };
  walk(c.item, "", pmAuth(c.auth) ?? undefined);
  const vars = enabled(c.variable).map((v): Header => [str(v.key), str(v.value)]);
  return space(str(c.info.name) || "Postman collection", requests, vars);
}

/* ─── OpenAPI 3 / Swagger 2 ─────────────────────────────────────────────── */

type Schema = { $ref?: string; type?: string; properties?: Record<string, Schema>; items?: Schema; example?: unknown; default?: unknown; enum?: unknown[]; format?: string; allOf?: Schema[] };
interface Param {
  $ref?: string;
  name?: string;
  in?: string;
  required?: boolean;
  example?: unknown;
  schema?: Schema;
  type?: string;
  format?: string;
}
interface Media {
  example?: unknown;
  examples?: Record<string, { value?: unknown }>;
  schema?: Schema;
}
interface Operation {
  summary?: string;
  operationId?: string;
  parameters?: Param[];
  requestBody?: { $ref?: string; content?: Record<string, Media> };
  security?: Record<string, unknown>[];
}
interface Scheme {
  type?: string;
  scheme?: string;
  name?: string;
  in?: string;
}
interface OasDoc {
  openapi?: string;
  swagger?: string;
  info?: { title?: string };
  servers?: { url?: string }[];
  host?: string;
  basePath?: string;
  schemes?: string[];
  paths?: Record<string, Record<string, Operation | Param[]>>;
  components?: { securitySchemes?: Record<string, Scheme> };
  securityDefinitions?: Record<string, Scheme>;
  security?: Record<string, unknown>[];
}

const VERBS = ["get", "post", "put", "patch", "delete", "head", "options"];

function openapi(doc: OasDoc): Space {
  /** Follows a local `#/a/b` reference. */
  const deref = <T extends { $ref?: string }>(o: T | undefined, depth = 0): T | undefined => {
    if (!o?.$ref || depth > 8 || !o.$ref.startsWith("#/")) return o;
    const target = o.$ref
      .slice(2)
      .split("/")
      .reduce<unknown>((at, key) => (at as Record<string, unknown> | undefined)?.[key.replace(/~1/g, "/").replace(/~0/g, "~")], doc);
    return deref(target as T, depth + 1);
  };

  /** A plausible example value for a schema, so bodies start filled in. */
  const sample = (s: Schema | undefined, depth = 0): unknown => {
    const sc = deref(s);
    if (!sc || depth > 5) return null;
    if (sc.example !== undefined) return sc.example;
    if (sc.default !== undefined) return sc.default;
    if (sc.enum?.length) return sc.enum[0];
    if (sc.allOf) return Object.assign({}, ...sc.allOf.map((p) => sample(p, depth + 1) ?? {}));
    if (sc.type === "array") return [sample(sc.items, depth + 1)];
    if (sc.type === "object" || sc.properties) return Object.fromEntries(Object.entries(sc.properties ?? {}).map(([k, v]) => [k, sample(v, depth + 1)]));
    return { string: "", integer: 0, number: 0, boolean: false }[sc.type ?? ""] ?? null;
  };

  const base = doc.servers?.[0]?.url ?? (doc.host ? `${doc.schemes?.[0] ?? "https"}://${doc.host}${doc.basePath ?? ""}` : "");
  const vars: Header[] = [["baseUrl", base.replace(/\/$/, "")]];
  const schemes = doc.components?.securitySchemes ?? doc.securityDefinitions ?? {};

  const authFor = (security: Record<string, unknown>[] | undefined): Auth | undefined => {
    const name = Object.keys(security?.[0] ?? {})[0];
    const s = name ? schemes[name] : undefined;
    if (!s) return undefined;
    if ((s.type === "http" && s.scheme === "bearer") || s.type === "oauth2" || s.type === "openIdConnect") return { type: "bearer", token: "{{token}}" };
    if ((s.type === "http" && s.scheme === "basic") || s.type === "basic") return { type: "basic", user: "{{username}}", pass: "{{password}}" };
    if (s.type === "apiKey" && s.in !== "cookie") return { type: "apikey", key: s.name ?? "X-API-Key", value: "{{apiKey}}", in: s.in === "query" ? "query" : "header" };
    return undefined;
  };

  const requests: Req[] = [];
  for (const [path, item] of Object.entries(doc.paths ?? {})) {
    const shared = (Array.isArray(item.parameters) ? item.parameters : []) as Param[];
    for (const verb of VERBS) {
      const op = item[verb] as Operation | undefined;
      if (!op || typeof op !== "object") continue;
      const params = [...shared, ...(op.parameters ?? [])].map((p) => deref(p)).filter((p): p is Param => !!p?.name);
      const value = (p: Param) => str(p.example ?? p.schema?.example ?? p.schema?.default ?? "");
      const query = params.filter((p) => p.in === "query" && p.required).map((p) => `${encodeURIComponent(p.name!)}=${encodeURIComponent(value(p))}`);
      const headers: Header[] = params.filter((p) => p.in === "header" && p.required).map((p) => [p.name!, value(p)]);

      let body = "";
      let bodyType: BodyType | undefined;
      let form: FormField[] | undefined;
      const content = deref(op.requestBody)?.content;
      const json = content && Object.entries(content).find(([type]) => type.includes("json"));
      const formType = content && (content["multipart/form-data"] ? "multipart" : content["application/x-www-form-urlencoded"] ? "form" : null);
      const swaggerBody = params.find((p) => p.in === "body");
      const swaggerForm = params.filter((p) => p.in === "formData");
      if (json) {
        const m = json[1];
        const ex = m.example ?? Object.values(m.examples ?? {})[0]?.value ?? sample(m.schema);
        body = JSON.stringify(ex ?? {}, null, 2);
        headers.push(["Content-Type", json[0]]);
      } else if (formType && content) {
        bodyType = formType;
        const props = deref(content[formType === "multipart" ? "multipart/form-data" : "application/x-www-form-urlencoded"].schema)?.properties ?? {};
        form = Object.entries(props).map(([name, s]) => ({ name, value: "", file: deref(s)?.format === "binary" || undefined }));
      } else if (swaggerBody) {
        body = JSON.stringify(sample(swaggerBody.schema) ?? {}, null, 2);
        headers.push(["Content-Type", "application/json"]);
      } else if (swaggerForm.length) {
        bodyType = swaggerForm.some((p) => p.type === "file") ? "multipart" : "form";
        form = swaggerForm.map((p) => ({ name: p.name!, value: "", file: p.type === "file" || undefined }));
      }

      const auth = authFor(op.security ?? doc.security);
      requests.push(
        newReq({
          name: op.summary?.trim() || op.operationId || `${verb.toUpperCase()} ${path}`,
          method: verb.toUpperCase(),
          // Path parameters become variables: /users/{id} → /users/{{id}}.
          url: `{{baseUrl}}${path.replace(/\{([^}]+)\}/g, "{{$1}}")}${query.length ? `?${query.join("&")}` : ""}`,
          headers: [["Accept", "application/json"], ...headers],
          body,
          bodyType,
          form,
          auth,
        }),
      );
    }
  }
  for (const r of requests)
    if (r.auth) {
      const v = r.auth.type === "bearer" ? ["token"] : r.auth.type === "basic" ? ["username", "password"] : ["apiKey"];
      for (const name of v) if (!vars.some(([k]) => k === name)) vars.push([name, ""]);
    }
  return space(doc.info?.title ?? "API", requests, vars);
}

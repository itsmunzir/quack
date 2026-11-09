import yaml from "js-yaml";
import type { Header } from "./api";
import { isAuth, type Auth } from "./auth";
import { isBodyType, isField, type FormField } from "./body";
import { newReq, reqTitle, uid, type Env, type Req, type Space } from "./store";
import { DEFAULT_THEME, isThemeId } from "./themes";

/*
 * A space saved as a folder of plain YAML files, so it can live in a git repo:
 *
 *   quack.yaml               name, theme, and the order of requests and environments
 *   requests/<name>.yaml     one file per request
 *   environments/<name>.yaml variables; secret ones are listed by name only
 *   local.yaml               secret values and the picked environment, kept out of git
 */

/** Relative path → file contents. */
export type Files = Record<string, string>;

export const MANIFEST = "quack.yaml";
export const LOCAL = "local.yaml";
const FORMAT = 1;

export const slug = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60) || "untitled";

/** Unique file stems, in order: `users`, `users-2`, … */
function stems(names: string[]): string[] {
  const used = new Set<string>();
  return names.map((n) => {
    const base = slug(n);
    let s = base;
    for (let i = 2; used.has(s); i++) s = `${base}-${i}`;
    used.add(s);
    return s;
  });
}

const reqStems = (sp: Space) => stems(sp.requests.map((r) => r.name || reqTitle(r)));
const envStems = (sp: Space) => stems(sp.envs.map((e) => e.name));

const dump = (doc: unknown) => yaml.dump(doc, { lineWidth: -1, noRefs: true, quotingType: '"' });

/** A value that only points at a variable, like `{{token}}`, is safe to commit. */
const isVarRef = (v: string) => /^\s*\{\{\s*[\w.-]+\s*\}\}\s*$/.test(v);

/** The field of an auth that holds its secret. */
const secretKey = (a: Auth) => (a.type === "bearer" ? "token" : a.type === "basic" ? "pass" : "value");

const rows = (list: Header[]) => list.filter(([k, v]) => k.trim() || v.trim()).map(([k, v]) => ({ [k]: v }));

export function toFiles(sp: Space): Files {
  const files: Files = {};
  const local: { environment?: string; environments?: Record<string, Record<string, string>>; auth?: Record<string, string> } = {};
  const rStems = reqStems(sp);
  const eStems = envStems(sp);

  files[MANIFEST] = dump({ quack: FORMAT, name: sp.name, theme: sp.theme, requests: rStems, environments: eStems });

  sp.requests.forEach((r, i) => {
    const doc: Record<string, unknown> = { name: r.name, method: r.method, url: r.url };
    const headers = rows(r.headers);
    if (headers.length) doc.headers = headers;
    if (r.bodyType && r.bodyType !== "raw") doc.bodyType = r.bodyType;
    if (r.body) doc.body = r.body;
    if (r.form?.length) doc.form = r.form.map((f) => (f.file ? { name: f.name, value: f.value, file: true } : { name: f.name, value: f.value }));
    if (r.auth) {
      const key = secretKey(r.auth);
      const secret = (r.auth as Record<string, string>)[key];
      if (secret && !isVarRef(secret)) {
        doc.auth = { ...r.auth, [key]: "" };
        (local.auth ??= {})[rStems[i]] = secret;
      } else doc.auth = r.auth;
    }
    if (r.pinned) doc.pinned = true;
    files[`requests/${rStems[i]}.yaml`] = dump(doc);
  });

  sp.envs.forEach((e, i) => {
    const secret = new Set(e.secrets ?? []);
    const vars: Record<string, string> = {};
    const hidden: Record<string, string> = {};
    for (const [k, v] of e.vars) {
      const name = k.trim();
      if (!name) continue;
      if (secret.has(name)) hidden[name] = v;
      else vars[name] = v;
    }
    const doc: Record<string, unknown> = { name: e.name, vars };
    if (Object.keys(hidden).length) {
      doc.secrets = Object.keys(hidden);
      (local.environments ??= {})[eStems[i]] = hidden;
    }
    files[`environments/${eStems[i]}.yaml`] = dump(doc);
  });

  const active = sp.envs.findIndex((e) => e.id === sp.envId);
  if (active >= 0) local.environment = eStems[active];
  if (Object.keys(local).length) files[LOCAL] = "# Secrets and personal choices for this folder. Keep it out of git.\n" + dump(local);
  return files;
}

/* ─── Reading ───────────────────────────────────────────────────────────── */

const str = (v: unknown, fallback = "") => (v === null || v === undefined ? fallback : typeof v === "object" ? fallback : String(v));
const obj = (v: unknown): Record<string, unknown> => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {});
const list = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);

function parse(files: Files, path: string): Record<string, unknown> {
  const text = files[path];
  if (text === undefined) return {};
  try {
    return obj(yaml.load(text, { schema: yaml.CORE_SCHEMA }));
  } catch (e) {
    const why = e instanceof Error ? e.message.split("\n")[0] : String(e);
    throw new Error(`${path} isn't valid YAML: ${why}`);
  }
}

/** Files under `dir/`, ordered as the manifest lists them, then any others by name. */
function ordered(files: Files, dir: string, listed: unknown): string[] {
  const onDisk = Object.keys(files)
    .filter((p) => p.startsWith(`${dir}/`) && p.endsWith(".yaml"))
    .map((p) => p.slice(dir.length + 1, -5))
    .sort();
  const want = list(listed).map((s) => str(s));
  return [...want.filter((s) => onDisk.includes(s)), ...onDisk.filter((s) => !want.includes(s))];
}

/**
 * Builds a space from a folder's files. `prev` is the space as Quack last had it:
 * requests and environments that kept their file name keep their ids, so tabs and history stay attached.
 */
export function fromFiles(files: Files, prev?: Space): Space {
  if (files[MANIFEST] === undefined) throw new Error(`There's no ${MANIFEST} in that folder.`);
  const man = parse(files, MANIFEST);
  const local = parse(files, LOCAL);
  const localAuth = obj(local.auth);
  const localEnvs = obj(local.environments);

  const prevReq = new Map(prev ? reqStems(prev).map((s, i) => [s, prev.requests[i].id]) : []);
  const prevEnv = new Map(prev ? envStems(prev).map((s, i) => [s, prev.envs[i].id]) : []);

  const requests = ordered(files, "requests", man.requests).map((stem): Req => {
    const d = parse(files, `requests/${stem}.yaml`);
    const headers = list(d.headers).flatMap((h) => Object.entries(obj(h)).map(([k, v]) => [k, str(v)] as Header));
    const form = list(d.form)
      .map((f) => ({ name: str(obj(f).name), value: str(obj(f).value), file: obj(f).file === true || obj(f).file === "true" || undefined }))
      .filter(isField) as FormField[];
    let auth: Auth | undefined;
    const a = obj(d.auth);
    if (a.type) {
      const filled = Object.fromEntries(Object.entries(a).map(([k, v]) => [k, str(v)]));
      const candidate = { ...filled } as Record<string, string>;
      const key = candidate.type === "bearer" ? "token" : candidate.type === "basic" ? "pass" : "value";
      if (!candidate[key] && localAuth[stem] !== undefined) candidate[key] = str(localAuth[stem]);
      if (candidate.type === "basic") candidate.user ??= "";
      if (candidate.type === "apikey") candidate.in = candidate.in === "query" ? "query" : "header";
      candidate[key] ??= "";
      if (isAuth(candidate)) auth = candidate;
    }
    return newReq({
      id: prevReq.get(stem) ?? uid(),
      name: str(d.name),
      method: str(d.method, "GET").toUpperCase(),
      url: str(d.url),
      headers,
      body: str(d.body),
      bodyType: isBodyType(d.bodyType) ? d.bodyType : undefined,
      form: form.length ? form : undefined,
      auth,
      pinned: d.pinned === true || d.pinned === "true" || undefined,
    });
  });

  const envStemsRead = ordered(files, "environments", man.environments);
  const envs = envStemsRead.map((stem): Env => {
    const d = parse(files, `environments/${stem}.yaml`);
    const vars: Header[] = Object.entries(obj(d.vars)).map(([k, v]) => [k, str(v)]);
    const secrets = list(d.secrets).map((s) => str(s)).filter(Boolean);
    const values = obj(localEnvs[stem]);
    for (const name of secrets) vars.push([name, str(values[name])]);
    return { id: prevEnv.get(stem) ?? uid(), name: str(d.name, stem), vars, ...(secrets.length ? { secrets } : {}) };
  });

  const active = envStemsRead.indexOf(str(local.environment));
  const theme = str(man.theme);
  return {
    id: prev?.id ?? uid(),
    name: str(man.name, "Untitled"),
    theme: isThemeId(theme) ? theme : DEFAULT_THEME,
    requests: requests.length ? requests : [newReq()],
    envs,
    envId: active >= 0 ? envs[active].id : null,
    ...(prev?.folder ? { folder: prev.folder } : {}),
  };
}

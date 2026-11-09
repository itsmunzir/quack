import type { FormPart, Header } from "./api";
import { sh, toCurl } from "./curl";

/** A request exactly as it goes on the wire: variables filled in, auth folded in, forms encoded. */
export interface Wire {
  method: string;
  url: string;
  headers: Header[];
  body: string;
  multipart?: FormPart[];
}

export type Lang = "curl" | "fetch" | "python" | "go" | "httpie";

export const LANGS: readonly { id: Lang; name: string; detail: string }[] = [
  { id: "curl", name: "cURL", detail: "Shell" },
  { id: "fetch", name: "fetch", detail: "JavaScript" },
  { id: "python", name: "requests", detail: "Python" },
  { id: "go", name: "net/http", detail: "Go" },
  { id: "httpie", name: "HTTPie", detail: "Shell" },
];

/** Code that sends the request. `sendBody` is false for methods that can't carry one. */
export function toCode(lang: Lang, r: Wire, sendBody: boolean): string {
  const w: Wire = { ...r, headers: r.headers.filter(([k]) => k.trim()), body: sendBody ? r.body : "", multipart: sendBody && r.multipart?.length ? r.multipart : undefined };
  // Multipart sets its own Content-Type, with the boundary.
  if (w.multipart) w.headers = w.headers.filter(([k]) => !isContentType(k));
  if (lang === "curl") return toCurl(w, sendBody);
  if (lang === "fetch") return fetchCode(w);
  if (lang === "python") return pythonCode(w);
  if (lang === "go") return goCode(w);
  return httpieCode(w);
}

const isContentType = (k: string) => k.trim().toLowerCase() === "content-type";
const q = (s: string) => JSON.stringify(s);
const fileName = (path: string) => path.split(/[\\/]/).pop() || path;

/** The body parsed, when it's JSON: by its Content-Type, or because it plainly is an object or array. */
function jsonBody(w: Wire): { value: unknown } | null {
  if (!w.body.trim()) return null;
  const type = w.headers.find(([k]) => isContentType(k))?.[1].toLowerCase();
  if (type && !type.includes("json")) return null;
  try {
    const value = JSON.parse(w.body);
    return type || (value !== null && typeof value === "object") ? { value } : null;
  } catch {
    return null;
  }
}

const indent = (text: string, by: string) => text.replace(/\n/g, `\n${by}`);

/* ─── JavaScript ────────────────────────────────────────────────────────── */

function fetchCode(w: Wire): string {
  const lines: string[] = [];
  const opts: string[] = [];
  if (w.method !== "GET") opts.push(`method: ${q(w.method)}`);
  if (w.headers.length) {
    const names = w.headers.map(([k]) => k.toLowerCase());
    // An object reads best; an array keeps repeated headers.
    opts.push(
      names.length === new Set(names).size
        ? `headers: {\n${w.headers.map(([k, v]) => `    ${q(k)}: ${q(v)},`).join("\n")}\n  }`
        : `headers: [\n${w.headers.map(([k, v]) => `    [${q(k)}, ${q(v)}],`).join("\n")}\n  ]`,
    );
  }
  if (w.multipart) {
    // Files are read the Node way; in a browser, append a File from an <input> instead.
    if (w.multipart.some((p) => p.file)) lines.push(`import { readFile } from "node:fs/promises";`, "");
    lines.push("const form = new FormData();");
    for (const p of w.multipart)
      lines.push(p.file ? `form.append(${q(p.name)}, new Blob([await readFile(${q(p.value)})]), ${q(fileName(p.value))});` : `form.append(${q(p.name)}, ${q(p.value)});`);
    lines.push("");
    opts.push("body: form");
  } else if (w.body) {
    const json = jsonBody(w);
    opts.push(json ? `body: JSON.stringify(${indent(JSON.stringify(json.value, null, 2), "  ")})` : `body: ${q(w.body)}`);
  }
  lines.push(opts.length ? `const res = await fetch(${q(w.url)}, {\n${opts.map((o) => `  ${o},`).join("\n")}\n});` : `const res = await fetch(${q(w.url)});`);
  lines.push("console.log(res.status, await res.text());");
  return lines.join("\n");
}

/* ─── Python ────────────────────────────────────────────────────────────── */

/** JSON as a Python literal: the same text, with true, false and null spelled the Python way. */
const pyLiteral = (value: unknown, pad: string) =>
  indent(JSON.stringify(value, null, 4), pad).replace(/("(?:\\.|[^"\\])*")|\b(true|false|null)\b/g, (_, str: string | undefined, lit: string | undefined) =>
    str ? str : lit === "true" ? "True" : lit === "false" ? "False" : "None",
  );

/** A dict can't repeat a key, so repeated headers are joined with commas, which HTTP reads the same way. */
function combine(headers: Header[]): Header[] {
  const out = new Map<string, Header>();
  for (const [k, v] of headers) {
    const key = k.toLowerCase();
    const seen = out.get(key);
    out.set(key, seen ? [seen[0], `${seen[1]}, ${v}`] : [k, v]);
  }
  return [...out.values()];
}

const PY_METHODS = new Set(["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"]);

function pythonCode(w: Wire): string {
  const args: string[] = [q(w.url)];
  const json = !w.multipart && jsonBody(w);
  if (w.headers.length) {
    // requests sets Content-Type itself for json= and files=.
    const headers = combine(json ? w.headers.filter(([k]) => !isContentType(k)) : w.headers);
    if (headers.length) args.push(`headers={\n${headers.map(([k, v]) => `        ${q(k)}: ${q(v)},`).join("\n")}\n    }`);
  }
  if (w.multipart) {
    const fields = w.multipart.filter((p) => !p.file);
    const files = w.multipart.filter((p) => p.file);
    if (fields.length) args.push(`data={\n${fields.map((p) => `        ${q(p.name)}: ${q(p.value)},`).join("\n")}\n    }`);
    if (files.length) args.push(`files={\n${files.map((p) => `        ${q(p.name)}: open(${q(p.value)}, "rb"),`).join("\n")}\n    }`);
  } else if (json) args.push(`json=${pyLiteral(json.value, "    ")}`);
  else if (w.body) args.push(`data=${q(w.body)}`);

  const call = PY_METHODS.has(w.method) ? `requests.${w.method.toLowerCase()}(` : `requests.request(\n    ${q(w.method)},`;
  const body = args.length === 1 && PY_METHODS.has(w.method) ? `${call}${args[0]})` : `${call}\n${args.map((a) => `    ${a},`).join("\n")}\n)`;
  return `import requests\n\nres = ${body}\nprint(res.status_code, res.text)`;
}

/* ─── Go ────────────────────────────────────────────────────────────────── */

/** A raw string literal where it can be one, else an escaped one. */
const goStr = (s: string) => (s.includes("\n") && !s.includes("`") && !s.includes("\r") ? `\`${s}\`` : q(s));

function goCode(w: Wire): string {
  const imports = new Set(["fmt", "io", "net/http"]);
  const body: string[] = [];
  let reader = "nil";
  if (w.multipart) {
    imports.add("bytes").add("mime/multipart");
    body.push("\tvar buf bytes.Buffer", "\tform := multipart.NewWriter(&buf)");
    for (const p of w.multipart) {
      if (!p.file) {
        body.push(`\tform.WriteField(${q(p.name)}, ${q(p.value)})`);
        continue;
      }
      imports.add("os").add("path/filepath");
      body.push(
        `\tif err := addFile(form, ${q(p.name)}, ${q(p.value)}); err != nil {`,
        "\t\tpanic(err)",
        "\t}",
      );
    }
    body.push("\tform.Close()", "");
    reader = "&buf";
  } else if (w.body) {
    imports.add("strings");
    reader = `strings.NewReader(${goStr(w.body)})`;
  }
  body.push(`\treq, err := http.NewRequest(${q(w.method)}, ${q(w.url)}, ${reader})`, "\tif err != nil {", "\t\tpanic(err)", "\t}");
  for (const [k, v] of w.headers) body.push(`\treq.Header.Add(${q(k)}, ${q(v)})`);
  if (w.multipart) body.push("\treq.Header.Set(\"Content-Type\", form.FormDataContentType())");
  body.push(
    "",
    "\tres, err := http.DefaultClient.Do(req)",
    "\tif err != nil {",
    "\t\tpanic(err)",
    "\t}",
    "\tdefer res.Body.Close()",
    "",
    "\tdata, err := io.ReadAll(res.Body)",
    "\tif err != nil {",
    "\t\tpanic(err)",
    "\t}",
    "\tfmt.Println(res.Status)",
    "\tfmt.Println(string(data))",
  );
  const helper = imports.has("os")
    ? [
        "",
        "func addFile(form *multipart.Writer, field, path string) error {",
        "\tfile, err := os.Open(path)",
        "\tif err != nil {",
        "\t\treturn err",
        "\t}",
        "\tdefer file.Close()",
        "\tpart, err := form.CreateFormFile(field, filepath.Base(path))",
        "\tif err != nil {",
        "\t\treturn err",
        "\t}",
        "\t_, err = io.Copy(part, file)",
        "\treturn err",
        "}",
      ]
    : [];
  return [
    "package main",
    "",
    "import (",
    ...[...imports].sort().map((i) => `\t${q(i)}`),
    ")",
    "",
    "func main() {",
    ...body,
    "}",
    ...helper,
  ].join("\n");
}

/* ─── HTTPie ────────────────────────────────────────────────────────────── */

function httpieCode(w: Wire): string {
  // --multipart, not --form: --form only switches to multipart when a file is attached.
  const parts = [`${w.multipart ? "http --multipart" : "http"} ${w.method} ${sh(w.url)}`];
  for (const [k, v] of w.headers) parts.push(sh(`${k}:${v}`));
  if (w.multipart) for (const p of w.multipart) parts.push(sh(`${p.name}${p.file ? "@" : "="}${p.value}`));
  else if (w.body) parts.push(`--raw ${sh(w.body)}`);
  return parts.join(" \\\n  ");
}

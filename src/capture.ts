import type { Header, SendResult } from "./api";

/** Where a captured value is read from. */
export type CaptureFrom = "body" | "header";

/** Saves part of a response into a variable, so later requests can use `{{name}}`. */
export interface Capture {
  /** The variable to set. */
  name: string;
  from: CaptureFrom;
  /** A JSON path for the body (`data.token`, `items[0].id`; empty for the whole body), or a header name. */
  path: string;
}

export const CAPTURE_FROM: readonly { id: CaptureFrom; name: string }[] = [
  { id: "body", name: "Body" },
  { id: "header", name: "Header" },
];

const isStr = (v: unknown): v is string => typeof v === "string";

export const isCapture = (c: unknown): c is Capture => {
  const o = c as Capture;
  return !!o && isStr(o.name) && isStr(o.path) && (o.from === "body" || o.from === "header");
};

/** `data.items[0]["odd key"].id` → ["data", "items", 0, "odd key", "id"]. A leading `$` is allowed. */
export function pathParts(path: string): (string | number)[] {
  const parts: (string | number)[] = [];
  const re = /\[\s*(\d+)\s*\]|\[\s*["']([^"']*)["']\s*\]|([^.[\]]+)/g;
  for (const m of path.trim().replace(/^\$\.?/, "").matchAll(re)) {
    if (m[1] !== undefined) parts.push(Number(m[1]));
    else if (m[2] !== undefined) parts.push(m[2]);
    else if (m[3].trim()) parts.push(/^\d+$/.test(m[3]) ? Number(m[3]) : m[3].trim());
  }
  return parts;
}

export function readPath(doc: unknown, path: string): unknown {
  let cur = doc;
  for (const p of pathParts(path)) {
    if (cur === null || typeof cur !== "object") return undefined;
    cur = (cur as Record<string | number, unknown>)[p];
  }
  return cur;
}

const asText = (v: unknown): string | undefined =>
  v === undefined || v === null ? undefined : typeof v === "string" ? v : typeof v === "object" ? JSON.stringify(v) : String(v);

/** Reads every capture from a response. A value that isn't there comes back as `undefined`. */
export function extract(res: Pick<SendResult, "body" | "headers">, captures: Capture[]): { capture: Capture; value?: string }[] {
  let json: unknown;
  let parsed = false;
  const body = () => {
    if (!parsed) {
      parsed = true;
      try {
        json = JSON.parse(res.body);
      } catch {
        json = undefined;
      }
    }
    return json;
  };
  return captures
    .filter((c) => c.name.trim())
    .map((capture) => {
      if (capture.from === "header") {
        const want = capture.path.trim().toLowerCase();
        return { capture, value: res.headers.find(([k]) => k.toLowerCase() === want)?.[1] };
      }
      if (!capture.path.trim()) return { capture, value: res.body };
      return { capture, value: asText(readPath(body(), capture.path)) };
    });
}

/** Sets variables by name, appending any that are new. Returns the new rows and which names were added. */
export function setVars(vars: Header[], values: { name: string; value: string }[]): { vars: Header[]; added: string[] } {
  const out = vars.map((h) => [...h] as Header);
  const added: string[] = [];
  for (const { name, value } of values) {
    const i = out.findIndex(([k]) => k.trim() === name);
    if (i >= 0) out[i][1] = value;
    else {
      // Fill a blank trailing row before adding another.
      const blank = out.findIndex(([k, v]) => !k.trim() && !v);
      if (blank >= 0) out[blank] = [name, value];
      else out.push([name, value]);
      added.push(name);
    }
  }
  return { vars: out, added };
}

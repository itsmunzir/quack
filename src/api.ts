import { invoke } from "@tauri-apps/api/core";

export type Header = [name: string, value: string];

export interface SendArgs {
  method: string;
  url: string;
  headers: Header[];
  body?: string;
  /** Replaces `body` with a multipart form; file parts carry a path the engine reads. */
  multipart?: FormPart[];
  timeoutMs?: number;
}

export interface FormPart {
  name: string;
  value: string;
  file: boolean;
}

/** Mirrors `SendResult` in src-tauri/src/lib.rs. */
export interface SendResult {
  status: number;
  statusReason: string | null;
  url: string;
  version: string;
  headers: Header[];
  body: string;
  sizeBytes: number;
  elapsedMs: number;
  /** The body as a `data:` URL, for images. */
  image?: string;
}

export const isTauri = "__TAURI_INTERNALS__" in window;

/** The error a request rejects with when `cancelRequest` stops it. */
export const CANCELLED = "Cancelled";

const browserAborts = new Map<string, AbortController>();

/** Sends a request through the Rust engine. `id` lets `cancelRequest` stop it. */
export function sendRequest(id: string, args: SendArgs): Promise<SendResult> {
  if (isTauri) return invoke<SendResult>("send_request", { id, args });
  if (import.meta.env.DEV) return browserFetch(id, args);
  return Promise.reject(new Error("Quack must run inside its desktop app to send requests."));
}

export function cancelRequest(id: string) {
  if (isTauri) void invoke("cancel_request", { id });
  else browserAborts.get(id)?.abort();
}

/** Dev-only: lets `npm run dev` preview the UI in a browser. CORS applies there. */
async function browserFetch(id: string, { method, url, headers, body }: SendArgs): Promise<SendResult> {
  const start = performance.now();
  const abort = new AbortController();
  browserAborts.set(id, abort);
  let res: Response;
  let text: string;
  try {
    res = await fetch(/^\w+:\/\//.test(url) ? url : `https://${url}`, { method, headers, body: body || undefined, signal: abort.signal });
    text = await res.text();
  } catch (e) {
    throw abort.signal.aborted ? CANCELLED : e;
  } finally {
    browserAborts.delete(id);
  }
  return {
    status: res.status,
    statusReason: res.statusText || null,
    url: res.url,
    version: "HTTP",
    headers: [...res.headers.entries()],
    body: text,
    sizeBytes: new Blob([text]).size,
    elapsedMs: Math.round(performance.now() - start),
  };
}

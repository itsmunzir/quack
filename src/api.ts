import { invoke } from "@tauri-apps/api/core";

export type Header = [name: string, value: string];

export interface SendArgs {
  method: string;
  url: string;
  headers: Header[];
  body?: string;
  timeoutMs?: number;
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
}

export const isTauri = "__TAURI_INTERNALS__" in window;

/** Sends a request through the Rust engine. */
export function sendRequest(args: SendArgs): Promise<SendResult> {
  if (isTauri) return invoke<SendResult>("send_request", { args });
  if (import.meta.env.DEV) return browserFetch(args);
  return Promise.reject(new Error("Quack must run inside its desktop app to send requests."));
}

/** Dev-only: lets `npm run dev` preview the UI in a browser. CORS applies there. */
async function browserFetch({ method, url, headers, body }: SendArgs): Promise<SendResult> {
  const start = performance.now();
  const res = await fetch(/^\w+:\/\//.test(url) ? url : `https://${url}`, { method, headers, body: body || undefined });
  const text = await res.text();
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

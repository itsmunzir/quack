import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { isTauri, type Header, type SendResult } from "./api";
import { BODYLESS, METHODS, parseParams, withParams, type Outcome, type Req } from "./store";
import { MODES, THEMES, type Mode, type ThemeId } from "./themes";
import { Duck } from "./Duck";
import { isCurl, parseCurl, toCurl } from "./curl";
import { hasVars, resolve, withEnv } from "./env";

/* ─── Small helpers ─────────────────────────────────────────────────────── */

export const methodColor = (m: string) =>
  `var(--m-${["GET", "POST", "PUT", "PATCH", "DELETE"].includes(m) ? m.toLowerCase() : "other"})`;

export const methodShort = (m: string) => (m === "DELETE" ? "DEL" : m === "OPTIONS" ? "OPT" : m === "PATCH" ? "PAT" : m);

export function formatBytes(n: number) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

export const statusTone = (s: number) => (s < 300 ? "ok" : s < 400 ? "m-post" : s < 500 ? "warn" : "err");

export function useClickOutside<T extends HTMLElement>(onOutside: () => void) {
  const ref = useRef<T>(null);
  const cb = useRef(onOutside);
  cb.current = onOutside;
  useEffect(() => {
    const down = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) cb.current();
    };
    const key = (e: KeyboardEvent) => e.key === "Escape" && cb.current();
    document.addEventListener("mousedown", down);
    document.addEventListener("keydown", key);
    return () => {
      document.removeEventListener("mousedown", down);
      document.removeEventListener("keydown", key);
    };
  }, []);
  return ref;
}

export function Chevron({ className = "size-3.5 opacity-60" }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" className={className} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4.5 6.5L8 10l3.5-3.5" />
    </svg>
  );
}

function Spinner() {
  return (
    <svg viewBox="0 0 16 16" className="size-4 animate-spin" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="8" cy="8" r="6" opacity="0.25" />
      <path d="M14 8a6 6 0 0 0-6-6" strokeLinecap="round" />
    </svg>
  );
}

export function Icon({ d, className = "size-3.5", filled }: { d: string; className?: string; filled?: boolean }) {
  return (
    <svg viewBox="0 0 16 16" className={className} fill={filled ? "currentColor" : "none"} stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <path d={d} />
    </svg>
  );
}
export const ICONS = {
  x: "M4 4l8 8M12 4l-8 8",
  plus: "M8 3v10M3 8h10",
  search: "M7 12A5 5 0 1 0 7 2a5 5 0 0 0 0 10zM14 14l-3.5-3.5",
  pin: "M9.5 2.5l4 4-2 1-2.5 2.5.5 3-1.5 1.5-2.5-2.5L3 14.5 1.5 13l2.5-2.5L1.5 8 3 6.5l3 .5L8.5 4.5z",
  copy: "M5.5 5.5V3a1 1 0 0 1 1-1H13a1 1 0 0 1 1 1v6.5a1 1 0 0 1-1 1h-2.5M3 5.5h6.5a1 1 0 0 1 1 1V13a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V6.5a1 1 0 0 1 1-1z",
  check: "M3.5 8.5l3 3 6-7",
  terminal: "M2.5 4l3.5 4-3.5 4M8 12.5h5.5",
  braces: "M5.5 2.5c-1.4 0-2 .6-2 2V6c0 1.1-.6 2-1.5 2 .9 0 1.5.9 1.5 2v1.5c0 1.4.6 2 2 2M10.5 2.5c1.4 0 2 .6 2 2V6c0 1.1.6 2 1.5 2-.9 0-1.5.9-1.5 2v1.5c0 1.4-.6 2-2 2",
  palette: "M8 14.5A6.5 6.5 0 1 1 14.5 8c0 1.5-1.2 2.3-2.5 2.3h-1.3a1.2 1.2 0 0 0-.8 2.1c.5.6.1 2.1-1.9 2.1zM4.8 7.5h0M6.8 4.8h0M10 4.8h0",
};

/** Copies to the clipboard and briefly confirms it. */
export function CopyButton({ label, text, icon = ICONS.copy }: { label: string; text: () => string; icon?: string }) {
  const [done, setDone] = useState(false);
  useEffect(() => {
    if (!done) return;
    const t = setTimeout(() => setDone(false), 1400);
    return () => clearTimeout(t);
  }, [done]);
  return (
    <button type="button" onClick={() => navigator.clipboard.writeText(text()).then(() => setDone(true))} className="btn btn-ghost voice h-7 gap-1.5 px-2.5 text-xs">
      <Icon d={done ? ICONS.check : icon} className="size-3.5" />
      {done ? "Copied" : label}
    </button>
  );
}

/** The request as a cURL command with variables filled in; the body is left out for methods that can't carry one. */
export const reqCurl = (r: Req, vars: Header[]) => toCurl(withEnv(r, vars), !BODYLESS.has(r.method));

/* ─── Menus ─────────────────────────────────────────────────────────────── */

export function Menu({ children, align = "left", width = "w-36" }: { children: ReactNode; align?: "left" | "right"; width?: string }) {
  return (
    <div
      className={`pop absolute top-full z-30 mt-1.5 ${width} ${align === "right" ? "right-0" : "left-0"} rounded-box border border-line bg-surface p-1 text-text shadow-[0_16px_40px_-10px_rgb(0_0_0/0.3)]`}
      role="menu"
    >
      {children}
    </div>
  );
}

export function MenuItem({ active, onClick, children }: { active?: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      role="menuitemradio"
      aria-checked={active}
      onClick={onClick}
      className={`flex h-8 w-full items-center gap-2.5 rounded-[calc(var(--r-box)-4px)] px-2.5 text-left transition-colors ${active ? "bg-raised" : "hover:bg-raised"}`}
    >
      {children}
    </button>
  );
}

/** A theme's marker: a dot in its accent. Marks spaces too. */
export function SpaceDot({ theme, className = "size-2.5" }: { theme: ThemeId; className?: string }) {
  return <span data-theme={theme} className={`shrink-0 rounded-full bg-accent ring-1 ring-line-strong ${className}`} />;
}

/** A row of mutually exclusive options, like a small segmented switch. */
function Segmented<T extends string>({ label, options, value, onChange }: { label: string; options: readonly { id: T; name: string }[]; value: T; onChange: (id: T) => void }) {
  return (
    <div role="radiogroup" aria-label={label} className="flex rounded-[calc(var(--r-box)-4px)] bg-raised p-0.5">
      {options.map((o) => (
        <button
          key={o.id}
          type="button"
          role="radio"
          aria-checked={o.id === value}
          onClick={() => onChange(o.id)}
          className={`voice h-7 flex-1 rounded-[calc(var(--r-box)-6px)] text-[12px] font-medium transition-colors ${o.id === value ? "bg-selected text-text shadow-sm" : "text-muted hover:text-text"}`}
        >
          {o.name}
        </button>
      ))}
    </div>
  );
}

/** The current space's theme, light or dark, and the Glow switch. */
export function ThemePicker({
  value,
  spaceName,
  onChange,
  onApplyAll,
  mode,
  onMode,
  glow,
  onGlow,
}: {
  value: ThemeId;
  spaceName: string;
  onChange: (id: ThemeId) => void;
  onApplyAll: () => void;
  mode: Mode;
  onMode: (mode: Mode) => void;
  glow: boolean;
  onGlow: (on: boolean) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useClickOutside<HTMLDivElement>(() => setOpen(false));
  const current = THEMES.find((t) => t.id === value) ?? THEMES[0];
  return (
    <div ref={ref} className="relative">
      <button type="button" aria-expanded={open} onClick={() => setOpen((o) => !o)} className="btn btn-ghost h-8 gap-2 px-3 text-xs" title="Theme">
        <SpaceDot theme={current.id} className="size-3" />
        {current.name}
      </button>
      {open && (
        <Menu align="right" width="w-64">
          <div className="label px-2.5 pt-2 pb-1">Theme for {spaceName}</div>
          {THEMES.map((t) => (
            <MenuItem key={t.id} active={t.id === value} onClick={() => onChange(t.id)}>
              <SpaceDot theme={t.id} className="size-3" />
              <span className="flex-1 text-[13px] font-medium">{t.name}</span>
            </MenuItem>
          ))}
          <MenuItem
            onClick={() => {
              onApplyAll();
              setOpen(false);
            }}
          >
            <span className="flex-1 text-[13px] text-muted">Use {current.name} for all spaces</span>
          </MenuItem>
          <div className="mt-1 flex flex-col gap-1 border-t border-line px-1 pt-2 pb-1">
            <Segmented label="Mode" options={MODES} value={mode} onChange={onMode} />
            <button
              type="button"
              role="switch"
              aria-checked={glow}
              onClick={() => onGlow(!glow)}
              className="flex h-8 w-full items-center justify-between rounded-[calc(var(--r-box)-4px)] px-1.5 text-left text-[13px] transition-colors hover:bg-raised"
            >
              Glow
              <span className={`relative h-[18px] w-8 rounded-full transition-colors ${glow ? "bg-accent" : "bg-line-strong"}`}>
                <span className={`absolute top-[2px] size-3.5 rounded-full bg-surface shadow-sm transition-[left] duration-200 ${glow ? "left-[16px]" : "left-[2px]"}`} />
              </span>
            </button>
          </div>
          <div className="flex items-center justify-between px-2.5 pt-0.5 pb-1.5 text-[11px] text-muted">
            Next theme <span className="kbd kbd-quiet">Ctrl Shift T</span>
          </div>
        </Menu>
      )}
    </div>
  );
}

/* ─── Window chrome ─────────────────────────────────────────────────────── */

/** Minimize, maximize and close, styled by the theme. Hidden outside Tauri. */
export function WindowControls() {
  return isTauri ? <TauriWindowControls /> : null;
}

function TauriWindowControls() {
  const win = getCurrentWindow();
  const [maximized, setMaximized] = useState(false);
  useEffect(() => {
    win.isMaximized().then(setMaximized);
    const off = win.onResized(() => win.isMaximized().then(setMaximized));
    return () => {
      off.then((f) => f());
    };
  }, []);
  const base = "flex h-full w-11 items-center justify-center text-muted transition-colors duration-100";
  const icon = { viewBox: "0 0 12 12", className: "size-3", fill: "none", stroke: "currentColor", strokeWidth: 1.1 };
  return (
    <div className="flex h-full">
      <button type="button" aria-label="Minimize" onClick={() => win.minimize()} className={`${base} hover:bg-text/8 hover:text-text`}>
        <svg {...icon}>
          <path d="M1.5 6h9" />
        </svg>
      </button>
      <button type="button" aria-label={maximized ? "Restore" : "Maximize"} onClick={() => win.toggleMaximize()} className={`${base} hover:bg-text/8 hover:text-text`}>
        <svg {...icon}>
          {maximized ? (
            <>
              <rect x="1.5" y="3.5" width="7" height="7" rx="1" />
              <path d="M3.5 3.5V2.5a1 1 0 0 1 1-1h5a1 1 0 0 1 1 1v5a1 1 0 0 1-1 1h-1" />
            </>
          ) : (
            <rect x="1.5" y="1.5" width="9" height="9" rx="1" />
          )}
        </svg>
      </button>
      <button type="button" aria-label="Close" onClick={() => win.close()} className={`${base} hover:bg-[#e81123] hover:text-white`}>
        <svg {...icon}>
          <path d="M2 2l8 8M10 2l-8 8" />
        </svg>
      </button>
    </div>
  );
}

/* ─── Tabs ──────────────────────────────────────────────────────────────── */

type TabOpt<T> = [id: T, label: string, count?: number];

/** Pill tabs with a thumb that slides to the active tab. */
function Tabs<T extends string>({ value, onChange, options }: { value: T; onChange: (v: T) => void; options: TabOpt<T>[] }) {
  const wrap = useRef<HTMLDivElement>(null);
  const [thumb, setThumb] = useState<{ left: number; width: number } | null>(null);
  useLayoutEffect(() => {
    const el = wrap.current?.querySelector<HTMLElement>('[aria-selected="true"]');
    if (el) setThumb({ left: el.offsetLeft, width: el.offsetWidth });
  }, [value, options.map((o) => o[2]).join()]);

  return (
    <div ref={wrap} className="relative flex gap-0.5 rounded-btn bg-raised p-0.5" role="tablist">
      {thumb && (
        <span
          className="absolute top-0.5 bottom-0.5 rounded-btn bg-selected shadow-[0_1px_2px_rgb(0_0_0/0.12),0_0_0_1px_var(--line)] transition-[left,width] duration-200 ease-[cubic-bezier(0.32,0.72,0,1)]"
          style={{ left: thumb.left, width: thumb.width }}
        />
      )}
      {options.map(([id, label, count]) => (
        <button
          key={id}
          type="button"
          role="tab"
          aria-selected={id === value}
          onClick={() => onChange(id)}
          className={`voice relative z-10 flex h-7 items-center gap-1.5 rounded-btn px-3 text-xs font-medium transition-colors ${id === value ? "text-text" : "text-muted hover:text-text"}`}
        >
          {label}
          {count ? <span className="font-mono text-[10px] text-muted">{count}</span> : null}
        </button>
      ))}
    </div>
  );
}

/* ─── Request editing ───────────────────────────────────────────────────── */

function MethodPicker({ value, onChange }: { value: string; onChange: (m: string) => void }) {
  const [open, setOpen] = useState(false);
  const ref = useClickOutside<HTMLDivElement>(() => setOpen(false));
  const c = methodColor(value);
  return (
    <div ref={ref} className="relative shrink-0">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="flex h-8 items-center gap-1.5 rounded-[calc(var(--r-box)-4px)] px-3 font-mono text-[12.5px] font-semibold transition-[filter,background-color] duration-150 active:brightness-95"
        style={{ color: c, background: `color-mix(in oklab, ${c} 13%, transparent)` }}
      >
        {value}
        <Chevron className="size-3 opacity-70" />
      </button>
      {open && (
        <Menu>
          {METHODS.map((m) => (
            <MenuItem
              key={m}
              active={m === value}
              onClick={() => {
                onChange(m);
                setOpen(false);
              }}
            >
              <span className="font-mono text-[13px] font-bold" style={{ color: methodColor(m) }}>
                {m}
              </span>
            </MenuItem>
          ))}
        </Menu>
      )}
    </div>
  );
}

/** Method, URL and Send in one bar. */
export function UrlBar({ req, vars, outcome, onChange, onSend }: { req: Req; vars: Header[]; outcome?: Outcome; onChange: (p: Partial<Req>) => void; onSend: () => void }) {
  const sending = !!outcome?.sending;
  return (
    <div>
      <form
        className="urlbar flex items-center"
        onSubmit={(e) => {
          e.preventDefault();
          onSend();
        }}
      >
        <MethodPicker value={req.method} onChange={(method) => onChange({ method })} />
        <input
          value={req.url}
          onChange={(e) => onChange({ url: e.target.value })}
          onPaste={(e) => {
            // Pasting a whole cURL command fills in the request instead of the URL.
            const text = e.clipboardData.getData("text");
            const parsed = isCurl(text) && parseCurl(text);
            if (!parsed) return;
            e.preventDefault();
            onChange(parsed);
          }}
          placeholder="Paste a URL or a cURL command"
          spellCheck={false}
          className="min-w-0 flex-1 bg-transparent px-3 font-mono text-[13px] text-text outline-none placeholder:text-muted/70"
        />
        <button type="submit" disabled={sending || !req.url.trim()} className="send-btn">
          {sending ? <Spinner /> : "Send"}
        </button>
      </form>
      {hasVars(req.url) && <Resolved url={req.url} vars={vars} />}
    </div>
  );
}

/** The URL as it will be sent, with any variables that have no value called out. */
function Resolved({ url, vars }: { url: string; vars: Header[] }) {
  const { text, missing } = resolve(url, vars);
  return (
    <div className="flex min-w-0 items-center gap-2 px-3 pt-1.5 font-mono text-[11.5px] text-muted">
      <span className="shrink-0 text-muted/60">→</span>
      <span className="truncate">{text}</span>
      {missing.length > 0 && <span className="shrink-0 text-err">{missing.map((m) => `{{${m}}}`).join(" ")} not set</span>}
    </div>
  );
}

export function KVEditor({ rows, onChange, keyLabel }: { rows: Header[]; onChange: (r: Header[]) => void; keyLabel: string }) {
  const set = (i: number, h: Header) => onChange(rows.map((x, j) => (j === i ? h : x)));
  const field =
    "h-8 rounded-[6px] bg-transparent px-2 font-mono text-[12.5px] outline-none transition-colors duration-150 placeholder:text-muted/60 hover:bg-raised/70 focus:bg-raised";
  return (
    <div className="flex flex-col">
      {rows.map(([k, v], i) => (
        <div key={i} className="group flex items-center gap-2 border-b border-line py-0.5">
          <input value={k} onChange={(e) => set(i, [e.target.value, v])} placeholder={keyLabel} spellCheck={false} className={`${field} w-2/5 text-text`} />
          <input value={v} onChange={(e) => set(i, [k, e.target.value])} placeholder="Value" spellCheck={false} className={`${field} min-w-0 flex-1 text-muted focus:text-text`} />
          <button
            type="button"
            onClick={() => onChange(rows.filter((_, j) => j !== i))}
            className="btn btn-ghost btn-icon size-7 opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
            aria-label={`Remove ${k || keyLabel.toLowerCase()}`}
          >
            <Icon d={ICONS.x} />
          </button>
        </div>
      ))}
      <button
        type="button"
        onClick={() => onChange([...rows, ["", ""]])}
        className="mt-1.5 self-start rounded-[6px] px-2 py-1 text-[12.5px] text-muted transition-colors hover:bg-raised hover:text-text"
      >
        + Add {keyLabel.toLowerCase()}
      </button>
    </div>
  );
}

/** Edits the query string as rows, keeping the URL the single source of truth. */
function ParamsEditor({ url, onChange }: { url: string; onChange: (url: string) => void }) {
  const [rows, setRows] = useState(() => parseParams(url));
  useEffect(() => {
    if (withParams(url, rows) !== url) setRows(parseParams(url));
  }, [url]);
  return (
    <KVEditor
      rows={rows}
      keyLabel="Param"
      onChange={(next) => {
        setRows(next);
        onChange(withParams(url, next));
      }}
    />
  );
}

type ReqTab = "params" | "headers" | "body";

export function RequestEditor({ req, vars, onChange }: { req: Req; vars: Header[]; onChange: (p: Partial<Req>) => void }) {
  const [tab, setTab] = useState<ReqTab>("params");
  const params = parseParams(req.url).length;
  const headers = req.headers.filter(([k]) => k.trim()).length;
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <div className="flex items-center justify-between gap-3">
        <Tabs
          value={tab}
          onChange={setTab}
          options={[
            ["params", "Params", params || undefined],
            ["headers", "Headers", headers || undefined],
            ["body", "Body"],
          ]}
        />
        <CopyButton label="cURL" icon={ICONS.terminal} text={() => reqCurl(req, vars)} />
      </div>
      <div className="min-h-0 flex-1 overflow-auto">
        {tab === "params" ? (
          <ParamsEditor url={req.url} onChange={(url) => onChange({ url })} />
        ) : tab === "headers" ? (
          <KVEditor rows={req.headers} onChange={(headers) => onChange({ headers })} keyLabel="Header" />
        ) : BODYLESS.has(req.method) ? (
          <Empty title={`${req.method} requests have no body`} note="Switch the method to POST, PUT or PATCH to send one." />
        ) : (
          <textarea
            value={req.body}
            onChange={(e) => onChange({ body: e.target.value })}
            placeholder={'{\n  "hello": "world"\n}'}
            spellCheck={false}
            className="field h-full min-h-40 w-full resize-none p-3 font-mono text-[13px] leading-relaxed"
          />
        )}
      </div>
    </div>
  );
}

/* ─── Response ──────────────────────────────────────────────────────────── */

type ResTab = "body" | "headers";

export function ResponseView({ outcome, meta }: { outcome?: Outcome; meta: (r: SendResult) => ReactNode }) {
  const [tab, setTab] = useState<ResTab>("body");
  const r = outcome?.result;
  if (outcome?.sending) return <Loading />;
  if (outcome?.error)
    return (
      <div key={outcome.seq} className="enter rounded-box border border-err/30 bg-err/8 p-4">
        <div className="label mb-1 !text-err">Request failed</div>
        <pre className="font-mono text-[13px] whitespace-pre-wrap text-text">{outcome.error}</pre>
      </div>
    );
  if (!r) return <Empty title="Ready when you are" note="Type a URL and hit Send, or press Ctrl + Enter." mascot />;
  return (
    <div key={outcome!.seq} className="flex min-h-0 flex-1 flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        {meta(r)}
        <Tabs
          value={tab}
          onChange={setTab}
          options={[
            ["body", "Body"],
            ["headers", "Headers", r.headers.length],
          ]}
        />
        <CopyButton label="Copy" text={() => (tab === "body" ? r.body : r.headers.map(([k, v]) => `${k}: ${v}`).join("\n"))} />
      </div>
      <div className="min-h-0 flex-1 overflow-auto rounded-box border border-line bg-bg/60 p-3">
        {tab === "body" ? (
          <Body text={r.body} />
        ) : (
          <table className="enter w-full font-mono text-[12.5px]">
            <tbody>
              {r.headers.map(([k, v], i) => (
                <tr key={i} className="border-b border-line align-top last:border-0">
                  <td className="py-1.5 pr-4 whitespace-nowrap text-muted">{k}</td>
                  <td className="py-1.5 break-all">{v}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

function Loading() {
  return (
    <div className="flex flex-col gap-3 pt-1">
      <div className="flex gap-2">
        <i className="shimmer h-6 w-20 rounded-full" />
        <i className="shimmer h-6 w-16 rounded-full" />
      </div>
      {[42, 86, 70, 78, 55, 64].map((w, i) => (
        <i key={i} className="shimmer h-3 rounded-full" style={{ width: `${w}%`, animationDelay: `${i * 60}ms` }} />
      ))}
    </div>
  );
}

function Empty({ title, note, mascot }: { title: string; note?: string; mascot?: boolean }) {
  return (
    <div className="flex h-full min-h-40 flex-col items-center justify-center gap-3 text-center">
      {mascot && <Duck size={56} className="text-text opacity-80" />}
      <div className="text-sm font-semibold">{title}</div>
      {note && <p className="max-w-72 text-xs text-muted">{note}</p>}
    </div>
  );
}

/** Pretty-prints JSON and tints it with the theme palette. */
function Body({ text }: { text: string }) {
  const lines = useMemo(() => {
    try {
      return highlight(JSON.stringify(JSON.parse(text), null, 2));
    } catch {
      return null;
    }
  }, [text]);
  const cls = "font-mono text-[13px] leading-relaxed";
  if (!lines) return <pre className={`${cls} enter break-all whitespace-pre-wrap`}>{text}</pre>;
  return (
    <div className={`${cls} json`}>
      {lines.map((parts, i) => (
        <div key={i} className="break-all whitespace-pre-wrap">
          {parts.length ? parts : " "}
        </div>
      ))}
    </div>
  );
}

// A JSON string (optionally followed by a colon, making it a key), a literal, or a number.
// (\x5c is a literal backslash: it matches escapes like \" inside strings.)
const JSON_TOKEN = /("(?:\x5c.|[^"\x5c])*")(\s*:)?|\b(true|false|null)\b|(-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)/g;

function highlight(json: string): ReactNode[][] {
  return json.split("\n").map((line, li) => {
    const parts: ReactNode[] = [];
    let last = 0;
    for (const m of line.matchAll(JSON_TOKEN)) {
      if (m.index > last) parts.push(line.slice(last, m.index));
      const [whole, str, colon, lit, num] = m;
      const k = `${li}:${m.index}`;
      if (str && colon) parts.push(<span key={k} className="j-key">{str}</span>, colon);
      else if (str) parts.push(<span key={k} className="j-str">{str}</span>);
      else if (lit) parts.push(<span key={k} className="j-lit">{lit}</span>);
      else if (num) parts.push(<span key={k} className="j-num">{num}</span>);
      else parts.push(whole);
      last = m.index + whole.length;
    }
    if (last < line.length) parts.push(line.slice(last));
    return parts;
  });
}

/* ─── Inline rename ─────────────────────────────────────────────────────── */

export function InlineEdit({ value, placeholder, onDone, className = "" }: { value: string; placeholder?: string; onDone: (v: string | null) => void; className?: string }) {
  const [v, setV] = useState(value);
  return (
    <input
      autoFocus
      value={v}
      placeholder={placeholder}
      onFocus={(e) => e.target.select()}
      onChange={(e) => setV(e.target.value)}
      onBlur={() => onDone(v)}
      onKeyDown={(e) => {
        if (e.key === "Enter") onDone(v);
        if (e.key === "Escape") onDone(null);
        e.stopPropagation();
      }}
      onClick={(e) => e.stopPropagation()}
      className={`min-w-0 rounded-[4px] bg-surface px-1 text-text outline-none ring-1 ring-accent ${className}`}
    />
  );
}

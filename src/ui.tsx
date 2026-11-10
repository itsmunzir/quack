import { Fragment, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { isTauri, type Header, type SendResult } from "./api";
import { BODYLESS, METHODS, parseParams, withParams, type Outcome, type Req } from "./store";
import { MODES, THEMES, type Mode, type ThemeId } from "./themes";
import { Duck } from "./Duck";
import { GLOW, glowMask } from "./dither";
import { isCurl, parseCurl } from "./curl";
import { LANGS, toCode, type Lang } from "./codegen";
import { hasVars, prepare, resolve } from "./env";
import { AUTH_TYPES, blankAuth, type Auth } from "./auth";
import { BODY_TYPES, type FormField } from "./body";
import { CAPTURE_FROM, extract, type Capture } from "./capture";
import { BodyView } from "./BodyView";

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
  code: "M5.5 4.5L2 8l3.5 3.5M10.5 4.5L14 8l-3.5 3.5M9 3l-2 10",
  clock: "M8 14.5A6.5 6.5 0 1 0 8 1.5a6.5 6.5 0 0 0 0 13zM8 4.5V8l2.5 1.5",
  download: "M8 2.5v8M4.5 7.5L8 11l3.5-3.5M3 13.5h10",
  clip: "M10.5 5L6 9.5a1.4 1.4 0 0 0 2 2l5-5a2.8 2.8 0 0 0-4-4L4 7.5a4.2 4.2 0 0 0 6 6l3.5-3.5",
  braces: "M5.5 2.5c-1.4 0-2 .6-2 2V6c0 1.1-.6 2-1.5 2 .9 0 1.5.9 1.5 2v1.5c0 1.4.6 2 2 2M10.5 2.5c1.4 0 2 .6 2 2V6c0 1.1.6 2 1.5 2-.9 0-1.5.9-1.5 2v1.5c0 1.4-.6 2-2 2",
  folder: "M2 4.5a1 1 0 0 1 1-1h3.2l1.5 1.5H13a1 1 0 0 1 1 1V12a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1z",
  lock: "M4.5 7.5V5.5a3.5 3.5 0 0 1 7 0v2M3.5 7.5h9v6h-9z",
  palette: "M8 14.5A6.5 6.5 0 1 1 14.5 8c0 1.5-1.2 2.3-2.5 2.3h-1.3a1.2 1.2 0 0 0-.8 2.1c.5.6.1 2.1-1.9 2.1zM4.8 7.5h0M6.8 4.8h0M10 4.8h0",
  gear: "M2.5 5.5h6M12.5 5.5h1M2.5 10.5h1M7.5 10.5h6M10.5 7a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3zM5.5 12a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3z",
  external: "M9.5 2.5h4v4M13.5 2.5L8 8M11.5 9.5v3a1 1 0 0 1-1 1h-7a1 1 0 0 1-1-1v-7a1 1 0 0 1 1-1h3",
  keyboard: "M2.5 4h11a1 1 0 0 1 1 1v6a1 1 0 0 1-1 1h-11a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1zM4.5 6.8h0M7 6.8h0M9 6.8h0M11.5 6.8h0M5.5 9.3h5",
  alert: "M8 14.5A6.5 6.5 0 1 0 8 1.5a6.5 6.5 0 0 0 0 13zM8 4.8v3.7M8 11.2h0",
};

/** Copies to the clipboard and briefly confirms it. */
export function CopyButton({ label, text, icon = ICONS.copy, compact }: { label: string; text: () => string; icon?: string; compact?: boolean }) {
  const [done, setDone] = useState(false);
  useEffect(() => {
    if (!done) return;
    const t = setTimeout(() => setDone(false), 1400);
    return () => clearTimeout(t);
  }, [done]);
  return (
    <button
      type="button"
      onClick={() => navigator.clipboard.writeText(text()).then(() => setDone(true))}
      title={compact ? (done ? "Copied" : `Copy as ${label}`) : undefined}
      aria-label={compact ? `Copy as ${label}` : undefined}
      className={`btn btn-ghost shrink-0 text-xs ${compact ? "btn-icon size-7" : "h-7 gap-1.5 px-2.5"}`}
    >
      <Icon d={done ? ICONS.check : icon} className="size-3.5" />
      {!compact && (done ? "Copied" : label)}
    </button>
  );
}

/** The request as code, with variables filled in; the body is left out for methods that can't carry one. */
export const reqCode = (lang: Lang, r: Req, vars: Header[]) => toCode(lang, prepare(r, vars), !BODYLESS.has(r.method));

/** Copies the request as cURL, fetch, Python, Go or HTTPie. */
function CopyAsCode({ req, vars }: { req: Req; vars: Header[] }) {
  const [open, setOpen] = useState(false);
  const [done, setDone] = useState<Lang | null>(null);
  const ref = useClickOutside<HTMLDivElement>(() => setOpen(false));
  useEffect(() => {
    if (!done) return;
    const t = setTimeout(() => {
      setDone(null);
      setOpen(false);
    }, 700);
    return () => clearTimeout(t);
  }, [done]);
  return (
    <div ref={ref} className="relative shrink-0">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        title="Copy as code"
        aria-label="Copy as code"
        className="btn btn-ghost btn-icon size-7"
      >
        <Icon d={ICONS.code} className="size-3.5" />
      </button>
      {open && (
        <Menu align="right" width="w-52">
          <div className="label px-2.5 pt-1.5 pb-1">Copy as</div>
          {LANGS.map((l) => (
            <MenuItem key={l.id} onClick={() => void navigator.clipboard.writeText(reqCode(l.id, req, vars)).then(() => setDone(l.id))}>
              <span className="flex-1 text-[13px]">{l.name}</span>
              {done === l.id ? <Icon d={ICONS.check} className="size-3.5 text-accent-strong" /> : <span className="text-[11.5px] text-muted">{l.detail}</span>}
            </MenuItem>
          ))}
        </Menu>
      )}
    </div>
  );
}

/** A request's method as a small tinted tag. */
export function MethodBadge({ method }: { method: string }) {
  return (
    <span className="w-8 shrink-0 rounded-[5px] bg-text/6 py-0.5 text-center font-mono text-[9.5px] font-bold" style={{ color: methodColor(method) }}>
      {methodShort(method)}
    </span>
  );
}

/* ─── Menus ─────────────────────────────────────────────────────────────── */

export function Menu({ children, align = "left", width = "w-36", up }: { children: ReactNode; align?: "left" | "right"; width?: string; up?: boolean }) {
  const side = up ? "bottom-full mb-1.5" : "top-full mt-1.5";
  const origin = up ? (align === "right" ? "origin-bottom-right" : "origin-bottom-left") : align === "right" ? "origin-top-right" : "origin-top-left";
  return (
    <div
      className={`${up ? "pop-up" : "pop"} absolute z-30 ${side} ${width} ${align === "right" ? "right-0" : "left-0"} ${origin} rounded-box border border-line bg-surface p-1 text-text shadow-[0_16px_40px_-10px_rgb(0_0_0/0.3)]`}
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
      role={active === undefined ? "menuitem" : "menuitemradio"}
      aria-checked={active}
      onClick={onClick}
      className={`flex h-8 w-full items-center gap-2.5 rounded-btn px-2.5 text-left transition-colors ${active ? "bg-raised" : "hover:bg-raised"}`}
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
    <div role="radiogroup" aria-label={label} className="flex rounded-[calc(var(--r-btn)+2px)] bg-raised p-0.5">
      {options.map((o) => (
        <button
          key={o.id}
          type="button"
          role="radio"
          aria-checked={o.id === value}
          onClick={() => onChange(o.id)}
          className={`h-7 flex-1 rounded-btn text-[12px] font-medium transition-colors ${o.id === value ? "bg-selected text-text shadow-sm" : "text-muted hover:text-text"}`}
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
              className="flex h-8 w-full items-center justify-between rounded-btn px-1.5 text-left text-[13px] transition-colors hover:bg-raised"
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

/** A tab, with an optional count or, when `true`, a dot marking it as set. */
type TabOpt<T> = [id: T, label: string, badge?: number | boolean];

/** Pill tabs with a thumb that slides to the active tab. */
function Tabs<T extends string>({ value, onChange, options }: { value: T; onChange: (v: T) => void; options: TabOpt<T>[] }) {
  const wrap = useRef<HTMLDivElement>(null);
  const [thumb, setThumb] = useState<{ left: number; width: number } | null>(null);
  useLayoutEffect(() => {
    const el = wrap.current?.querySelector<HTMLElement>('[aria-selected="true"]');
    if (el) setThumb({ left: el.offsetLeft, width: el.offsetWidth });
  }, [value, options.map((o) => o[2]).join()]);

  return (
    <div ref={wrap} className="relative flex w-max gap-0.5 rounded-[calc(var(--r-btn)+2px)] bg-raised p-0.5" role="tablist">
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
          className={`relative z-10 flex h-7 shrink-0 items-center gap-1.5 rounded-btn px-2.5 text-xs font-medium transition-colors ${id === value ? "text-text" : "text-muted hover:text-text"}`}
        >
          {label}
          {count === true ? <span className="size-1.5 rounded-full bg-accent-strong" /> : count ? <span className="font-mono text-[10px] text-muted">{count}</span> : null}
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
        className="press flex h-8 items-center gap-1.5 rounded-btn px-3 font-mono text-[12.5px] font-semibold transition-[filter,background-color] duration-150 active:brightness-95"
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
export function UrlBar({
  req,
  vars,
  outcome,
  onChange,
  onSend,
  onCancel,
}: {
  req: Req;
  vars: Header[];
  outcome?: Outcome;
  onChange: (p: Partial<Req>) => void;
  onSend: () => void;
  onCancel: () => void;
}) {
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
            onChange({ bodyType: undefined, form: undefined, auth: undefined, ...parsed });
          }}
          placeholder="Paste a URL or a cURL command"
          spellCheck={false}
          className="min-w-0 flex-1 bg-transparent px-3 font-mono text-[13px] text-text outline-none placeholder:text-muted/90"
        />
        {sending ? (
          <button type="button" onClick={onCancel} className="send-btn stop gap-2" title="Cancel (Ctrl Enter)">
            <Spinner />
            Cancel
          </button>
        ) : (
          <button type="submit" disabled={!req.url.trim()} className="send-btn">
            Send
          </button>
        )}
      </form>
      {hasVars(req.url) && <Resolved url={req.url} vars={vars} />}
    </div>
  );
}

/** Bearer, Basic or API key, folded into the request when it is sent. */
function AuthEditor({ auth, onChange }: { auth?: Auth; onChange: (a: Auth | undefined) => void }) {
  const field =
    "h-8 min-w-0 flex-1 rounded-sm bg-transparent px-2 font-mono text-[12.5px] outline-none transition-colors duration-150 placeholder:text-muted/90 hover:bg-raised/70 focus:bg-raised";
  const row = (label: string, input: ReactNode) => (
    <label className="flex items-center gap-2 border-b border-line py-0.5">
      <span className="w-24 shrink-0 px-2 text-[12.5px] text-muted">{label}</span>
      {input}
    </label>
  );
  const text = (value: string, set: (v: string) => void, placeholder: string, secret = false) => (
    <input type={secret ? "password" : "text"} value={value} onChange={(e) => set(e.target.value)} placeholder={placeholder} spellCheck={false} autoComplete="off" className={field} />
  );
  return (
    <div className="flex flex-col gap-3">
      <div className="max-w-sm">
        <Segmented label="Auth type" options={AUTH_TYPES} value={auth?.type ?? "none"} onChange={(t) => onChange(blankAuth(t, auth))} />
      </div>
      {auth?.type === "bearer" && <div>{row("Token", text(auth.token, (token) => onChange({ ...auth, token }), "{{token}}"))}</div>}
      {auth?.type === "basic" && (
        <div>
          {row("Username", text(auth.user, (user) => onChange({ ...auth, user }), "Username"))}
          {row("Password", text(auth.pass, (pass) => onChange({ ...auth, pass }), "Password", true))}
        </div>
      )}
      {auth?.type === "apikey" && (
        <div>
          {row("Key", text(auth.key, (key) => onChange({ ...auth, key }), "X-API-Key"))}
          {row("Value", text(auth.value, (value) => onChange({ ...auth, value }), "{{apiKey}}"))}
          {row(
            "Add to",
            <div className="w-48 py-1">
              <Segmented label="Add to" options={API_KEY_IN} value={auth.in} onChange={(v) => onChange({ ...auth, in: v })} />
            </div>,
          )}
        </div>
      )}
      <p className="px-2 text-[12px] text-muted">
        {!auth
          ? "No auth. Pick a type to have it added when the request is sent."
          : auth.type === "apikey"
            ? `Sent as the ${auth.in === "header" ? "header" : "query param"} ${auth.key || "…"}.`
            : "Sent as the Authorization header, replacing any you set by hand."}{" "}
        {auth && <>Use <code className="font-mono text-text">{"{{variables}}"}</code> to keep secrets in an environment.</>}
      </p>
    </div>
  );
}

const API_KEY_IN = [
  { id: "header", name: "Header" },
  { id: "query", name: "Query" },
] as const;

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

/** Editable name/value rows. With `secrets`, each row can be marked secret: masked here, and kept out of a shared folder. */
export function KVEditor({
  rows,
  onChange,
  keyLabel,
  secrets,
  onSecrets,
}: {
  rows: Header[];
  onChange: (r: Header[]) => void;
  keyLabel: string;
  secrets?: string[];
  onSecrets?: (names: string[]) => void;
}) {
  const set = (i: number, h: Header) => {
    const old = rows[i][0].trim();
    // A secret stays secret when it's renamed.
    if (secrets && onSecrets && old !== h[0].trim() && secrets.includes(old)) onSecrets(secrets.map((n) => (n === old ? h[0].trim() : n)));
    onChange(rows.map((x, j) => (j === i ? h : x)));
  };
  const isSecret = (k: string) => !!secrets?.includes(k.trim());
  const toggle = (k: string) => onSecrets?.(isSecret(k) ? secrets!.filter((n) => n !== k.trim()) : [...(secrets ?? []), k.trim()]);
  const field =
    "h-8 rounded-sm bg-transparent px-2 font-mono text-[12.5px] outline-none transition-colors duration-150 placeholder:text-muted/90 hover:bg-raised/70 focus:bg-raised";
  return (
    <div className="flex flex-col">
      {rows.map(([k, v], i) => (
        <div key={i} className="group flex items-center gap-2 border-b border-line py-0.5">
          <input value={k} onChange={(e) => set(i, [e.target.value, v])} placeholder={keyLabel} spellCheck={false} className={`${field} w-2/5 text-text`} />
          <input
            value={v}
            onChange={(e) => set(i, [k, e.target.value])}
            type={isSecret(k) ? "password" : "text"}
            placeholder="Value"
            spellCheck={false}
            className={`${field} min-w-0 flex-1 text-muted focus:text-text`}
          />
          {onSecrets && k.trim() && (
            <button
              type="button"
              onClick={() => toggle(k)}
              aria-pressed={isSecret(k)}
              className={`btn btn-ghost btn-icon size-7 ${isSecret(k) ? "!text-accent-strong" : "opacity-0 group-hover:opacity-100 focus-visible:opacity-100"}`}
              title={isSecret(k) ? "Secret: kept out of shared folders" : "Mark as secret"}
              aria-label={`${isSecret(k) ? "Unmark" : "Mark"} ${k} as secret`}
            >
              <Icon d={ICONS.lock} />
            </button>
          )}
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
        className="mt-1.5 self-start rounded-sm px-2 py-1 text-[12.5px] text-muted transition-colors hover:bg-raised hover:text-text"
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

type ReqTab = "params" | "headers" | "auth" | "body" | "capture";

export function RequestEditor({
  req,
  vars,
  envName,
  result,
  onChange,
}: {
  req: Req;
  vars: Header[];
  /** The active environment, where captures are saved. */
  envName?: string;
  /** The response on show, to preview captures against. */
  result?: SendResult;
  onChange: (p: Partial<Req>) => void;
}) {
  const [tab, setTab] = useState<ReqTab>("params");
  const params = parseParams(req.url).length;
  const headers = req.headers.filter(([k]) => k.trim()).length;
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 overflow-x-auto [scrollbar-width:none]!">
        <Tabs
          value={tab}
          onChange={setTab}
          options={[
            ["params", "Params", params || undefined],
            ["headers", "Headers", headers || undefined],
            ["auth", "Auth", !!req.auth],
            ["body", "Body"],
            ["capture", "Capture", req.captures?.filter((c) => c.name.trim()).length || undefined],
          ]}
        />
        </div>
        <CopyAsCode req={req} vars={vars} />
      </div>
      <div className="min-h-0 flex-1 overflow-auto">
        {tab === "params" ? (
          <ParamsEditor url={req.url} onChange={(url) => onChange({ url })} />
        ) : tab === "headers" ? (
          <KVEditor rows={req.headers} onChange={(headers) => onChange({ headers })} keyLabel="Header" />
        ) : tab === "auth" ? (
          <AuthEditor auth={req.auth} onChange={(auth) => onChange({ auth })} />
        ) : tab === "capture" ? (
          <CaptureEditor captures={req.captures ?? []} envName={envName} result={result} onChange={(captures) => onChange({ captures })} />
        ) : BODYLESS.has(req.method) ? (
          <Empty title={`${req.method} requests have no body`} note="Switch the method to POST, PUT or PATCH to send one." />
        ) : (
          <BodyEditor req={req} onChange={onChange} />
        )}
      </div>
    </div>
  );
}

/** Picks values out of a response to save as variables, previewing each against the response on show. */
function CaptureEditor({ captures, envName, result, onChange }: { captures: Capture[]; envName?: string; result?: SendResult; onChange: (c: Capture[]) => void }) {
  const set = (i: number, patch: Partial<Capture>) => onChange(captures.map((c, j) => (j === i ? { ...c, ...patch } : c)));
  const add = () => onChange([...captures, { name: "", from: "body", path: "" }]);
  const preview = useMemo(() => (result ? extract(result, captures.map((c) => ({ ...c, name: c.name || "_" }))) : []), [result, captures]);
  const field =
    "h-8 rounded-sm bg-transparent px-2 font-mono text-[12.5px] outline-none transition-colors duration-150 placeholder:text-muted/90 hover:bg-raised/70 focus:bg-raised";

  if (!captures.length)
    return (
      <div className="flex h-full min-h-40 flex-col items-center justify-center gap-3 text-center">
        <div className="text-sm font-semibold">Chain requests</div>
        <p className="max-w-80 text-xs text-muted">
          Save part of this response, like a login token, as a variable. Other requests use it as <code className="font-mono text-text">{"{{token}}"}</code>.
        </p>
        <button type="button" onClick={add} className="btn btn-ghost h-7 px-3 text-xs">
          + Add capture
        </button>
      </div>
    );

  return (
    <div className="flex flex-col">
      {captures.map((c, i) => {
        const value = preview[i]?.value;
        return (
          <div key={i} className="group border-b border-line py-1">
            <div className="flex items-center gap-2">
              <input value={c.name} onChange={(e) => set(i, { name: e.target.value })} placeholder="token" spellCheck={false} aria-label="Variable" className={`${field} w-[28%] min-w-20 text-text`} />
              <button
                type="button"
                onClick={() => set(i, { from: c.from === "body" ? "header" : "body" })}
                title={`Reading the response ${c.from}. Click to read a ${c.from === "body" ? "header" : "body path"} instead.`}
                className="h-6 w-[60px] shrink-0 rounded-btn bg-raised text-[11px] font-medium text-muted transition-colors hover:bg-text/10 hover:text-text"
              >
                {CAPTURE_FROM.find((f) => f.id === c.from)!.name}
              </button>
              <input
                value={c.path}
                onChange={(e) => set(i, { path: e.target.value })}
                placeholder={c.from === "body" ? "data.token" : "X-Request-Id"}
                spellCheck={false}
                aria-label={c.from === "body" ? "JSON path" : "Header name"}
                className={`${field} min-w-0 flex-1 text-muted focus:text-text`}
              />
              <button
                type="button"
                onClick={() => onChange(captures.filter((_, j) => j !== i))}
                className="btn btn-ghost btn-icon size-7 opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
                aria-label={`Remove ${c.name || "capture"}`}
              >
                <Icon d={ICONS.x} />
              </button>
            </div>
            {result && (
              <div className="truncate pr-9 pl-2 font-mono text-[11.5px]" title={value}>
                {value === undefined ? <span className="text-err/80">not in this response</span> : <span className="text-muted">= {value || '""'}</span>}
              </div>
            )}
          </div>
        );
      })}
      <button type="button" onClick={add} className="mt-1.5 self-start rounded-sm px-2 py-1 text-[12.5px] text-muted transition-colors hover:bg-raised hover:text-text">
        + Add capture
      </button>
      <p className="mt-3 px-2 text-[12px] text-muted">
        After a 2xx response, each value is saved to {envName ? <span className="text-text">{envName}</span> : "a new Default environment"}. Body paths look like{" "}
        <code className="font-mono text-text">data.items[0].id</code>; leave it empty for the whole body.
      </p>
    </div>
  );
}

/** Raw text, a URL-encoded form, or a multipart form with files. */
function BodyEditor({ req, onChange }: { req: Req; onChange: (p: Partial<Req>) => void }) {
  const type = req.bodyType ?? "raw";
  return (
    <div className="flex h-full flex-col gap-3">
      <div className="max-w-xs shrink-0">
        <Segmented label="Body type" options={BODY_TYPES} value={type} onChange={(t) => onChange({ bodyType: t === "raw" ? undefined : t, form: req.form ?? [] })} />
      </div>
      {type === "raw" ? (
        <textarea
          value={req.body}
          onChange={(e) => onChange({ body: e.target.value })}
          placeholder={'{\n  "hello": "world"\n}'}
          spellCheck={false}
          className="field min-h-40 w-full flex-1 resize-none p-3 font-mono text-[13px] leading-relaxed"
        />
      ) : (
        <div>
          <FieldsEditor fields={req.form ?? []} files={type === "multipart"} onChange={(form) => onChange({ form })} />
          <p className="px-2 pt-3 text-[12px] text-muted">
            {type === "form" ? "Sent as application/x-www-form-urlencoded." : "Sent as multipart/form-data. Files are read from disk each time you send."}
          </p>
        </div>
      )}
    </div>
  );
}

/** Asks for one file and returns its path. Only the desktop app can pick files. */
async function pickFile(): Promise<string | null> {
  if (!isTauri) return null;
  const { open } = await import("@tauri-apps/plugin-dialog");
  const path = await open({ multiple: false, directory: false });
  return typeof path === "string" ? path : null;
}

const fileName = (path: string) => path.split(/[\\/]/).pop() || path;

/** Name and value rows; with `files`, a row can hold a file instead of text. */
function FieldsEditor({ fields, files, onChange }: { fields: FormField[]; files: boolean; onChange: (f: FormField[]) => void }) {
  const set = (i: number, f: FormField) => onChange(fields.map((x, j) => (j === i ? f : x)));
  const chooseFile = async (i: number | null) => {
    const path = await pickFile();
    if (!path) return;
    if (i === null) onChange([...fields, { name: fileName(path).replace(/\.[^.]*$/, ""), value: path, file: true }]);
    else set(i, { ...fields[i], value: path, file: true });
  };
  const field =
    "h-8 rounded-sm bg-transparent px-2 font-mono text-[12.5px] outline-none transition-colors duration-150 placeholder:text-muted/90 hover:bg-raised/70 focus:bg-raised";
  return (
    <div className="flex flex-col">
      {fields.map((f, i) => {
        const isFile = files && f.file;
        return (
          <div key={i} className="group flex items-center gap-2 border-b border-line py-0.5">
            <input value={f.name} onChange={(e) => set(i, { ...f, name: e.target.value })} placeholder="Name" spellCheck={false} className={`${field} w-2/5 text-text`} />
            {isFile ? (
              <button
                type="button"
                onClick={() => chooseFile(i)}
                title={f.value}
                className="flex h-8 min-w-0 flex-1 items-center gap-2 rounded-sm px-2 text-left font-mono text-[12.5px] text-text transition-colors hover:bg-raised/70"
              >
                <Icon d={ICONS.clip} className="size-3.5 shrink-0 text-muted" />
                <span className="truncate">{f.value ? fileName(f.value) : "Choose a file…"}</span>
              </button>
            ) : (
              <input value={f.value} onChange={(e) => set(i, { ...f, value: e.target.value, file: undefined })} placeholder="Value" spellCheck={false} className={`${field} min-w-0 flex-1 text-muted focus:text-text`} />
            )}
            {files && (
              <button
                type="button"
                onClick={() => (isFile ? set(i, { ...f, value: "", file: undefined }) : chooseFile(i))}
                className="btn btn-ghost h-7 px-2 text-[11px] opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
                title={isFile ? "Use text instead" : "Attach a file"}
              >
                {isFile ? "Text" : "File"}
              </button>
            )}
            <button
              type="button"
              onClick={() => onChange(fields.filter((_, j) => j !== i))}
              className="btn btn-ghost btn-icon size-7 opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
              aria-label={`Remove ${f.name || "field"}`}
            >
              <Icon d={ICONS.x} />
            </button>
          </div>
        );
      })}
      <div className="mt-1.5 flex gap-1">
        <button type="button" onClick={() => onChange([...fields, { name: "", value: "" }])} className="rounded-sm px-2 py-1 text-[12.5px] text-muted transition-colors hover:bg-raised hover:text-text">
          + Add field
        </button>
        {files && isTauri && (
          <button type="button" onClick={() => chooseFile(null)} className="rounded-sm px-2 py-1 text-[12.5px] text-muted transition-colors hover:bg-raised hover:text-text">
            + Add file
          </button>
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
  if (!r) return <Ready />;
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
        {!(tab === "body" && r.image) && <CopyButton label="Copy" text={() => (tab === "body" ? r.body : r.headers.map(([k, v]) => `${k}: ${v}`).join("\n"))} />}
      </div>
      <div className={`min-h-0 flex-1 rounded-box border border-line bg-bg/60 ${tab === "body" ? "overflow-hidden" : "overflow-auto p-3"}`}>
        {tab === "body" ? (
          <BodyView text={r.body} image={r.image} />
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

function Empty({ title, note }: { title: string; note?: string }) {
  return (
    <div className="flex h-full min-h-40 flex-col items-center justify-center gap-3 text-center">
      <div className="text-sm font-semibold">{title}</div>
      {note && <p className="max-w-72 text-xs text-muted">{note}</p>}
    </div>
  );
}

const READY_KEYS: [string, string][] = [
  ["Send request", "Ctrl Enter"],
  ["New request", "Ctrl N"],
  ["Command bar", "Ctrl K"],
  ["All shortcuts", "Ctrl /"],
];

/** Before the first send: the duck on a dithered glow, and the few keys worth knowing. */
function Ready() {
  const mask = useMemo(glowMask, []);
  return (
    <div className="flex h-full min-h-40 flex-col items-center justify-center gap-5 text-center">
      <div className="relative grid size-16 place-items-center">
        <span aria-hidden="true" className="dither-glow" style={{ width: GLOW.width, height: GLOW.height, maskImage: `url(${mask})` }} />
        <Duck size={56} className="relative text-text" />
      </div>
      <div className="relative text-sm font-semibold">Ready when you are</div>
      <dl className="relative grid grid-cols-[auto_auto] items-center gap-x-4 gap-y-2 text-xs">
        {READY_KEYS.map(([what, keys]) => (
          <Fragment key={what}>
            <dt className="text-right text-muted">{what}</dt>
            <dd className="text-left">
              <span className="kbd kbd-quiet">{keys}</span>
            </dd>
          </Fragment>
        ))}
      </dl>
    </div>
  );
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
      className={`min-w-0 rounded-sm bg-surface px-1 text-text outline-none ring-1 ring-accent-strong ${className}`}
    />
  );
}

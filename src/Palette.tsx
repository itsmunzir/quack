import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { MAX_SPACES, reqTitle, useWorkspace } from "./store";
import { MODES, THEMES, type Mode } from "./themes";
import { backupAll, exportSpace, importFile } from "./files";
import { folderName, openFolder, saveToFolder, unlinkFolder } from "./sync";
import { Icon, ICONS, methodColor, methodShort, reqCode, SpaceDot } from "./ui";
import { LANGS } from "./codegen";
import { issueUrl, openLink, REPO, VERSION } from "./links";

interface Item {
  id: string;
  group: string;
  label: string;
  detail?: string;
  icon: ReactNode;
  hint?: string;
  run: () => void;
}

/** Ctrl K: jump to any request or space, or run an action. */
export function Palette({
  open,
  onClose,
  onMode,
  onToggleGlow,
  onShortcuts,
}: {
  open: boolean;
  onClose: () => void;
  onMode: (m: Mode) => void;
  onToggleGlow: () => void;
  onShortcuts: () => void;
}) {
  const ws = useWorkspace();
  const [q, setQ] = useState("");
  const [sel, setSel] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const list = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open) {
      setQ("");
      setSel(0);
      requestAnimationFrame(() => input.current?.focus());
    }
  }, [open]);

  const items = useMemo<Item[]>(() => {
    const out: Item[] = [];
    for (const s of ws.spaces)
      for (const r of s.requests)
        out.push({
          id: r.id,
          group: "Requests",
          label: reqTitle(r),
          detail: `${s.name} · ${r.url || "no URL"}`,
          icon: (
            <span className="w-9 font-mono text-[10px] font-bold" style={{ color: methodColor(r.method) }}>
              {methodShort(r.method)}
            </span>
          ),
          run: () => ws.selectReq(s.id, r.id),
        });
    for (const s of ws.spaces)
      out.push({
        id: `space-${s.id}`,
        group: "Spaces",
        label: s.name,
        detail: `${s.requests.length} request${s.requests.length === 1 ? "" : "s"}`,
        icon: <SpaceDot theme={s.theme} className="size-3" />,
        run: () => ws.selectSpace(s.id),
      });
    out.push(
      { id: "new-req", group: "Actions", label: "New request", icon: <Icon d={ICONS.plus} />, hint: "Ctrl N", run: () => ws.addReq() },
      { id: "dup-req", group: "Actions", label: "Duplicate request", detail: reqTitle(ws.req), icon: <Icon d={ICONS.copy} />, hint: "Ctrl D", run: () => ws.duplicateReq(ws.req.id) },
      ...LANGS.map((l) => ({
        id: `code-${l.id}`,
        group: "Actions",
        label: `Copy as ${l.name}`,
        detail: l.id === "curl" ? reqTitle(ws.req) : l.detail,
        icon: <Icon d={l.id === "curl" || l.id === "httpie" ? ICONS.terminal : ICONS.code} />,
        run: () => void navigator.clipboard.writeText(reqCode(l.id, ws.req, ws.vars)),
      })),
      { id: "del-req", group: "Actions", label: "Delete request", detail: reqTitle(ws.req), icon: <Icon d={ICONS.x} />, run: () => ws.deleteReq(ws.req.id) },
      ...(ws.spaces.length < MAX_SPACES ? [{ id: "new-space", group: "Actions", label: "New space", icon: <Icon d={ICONS.plus} />, run: () => ws.addSpace() }] : []),
    );
    for (const e of ws.space.envs)
      out.push({ id: `env-${e.id}`, group: "Environments", label: e.name || "Untitled", detail: e.id === ws.env?.id ? "active" : `${e.vars.filter(([k]) => k.trim()).length} variables`, icon: <Icon d={ICONS.braces} />, run: () => ws.selectEnv(e.id) });
    if (ws.env) out.push({ id: "env-none", group: "Environments", label: "No environment", icon: <Icon d={ICONS.braces} />, run: () => ws.selectEnv(null) });
    out.push(
      ...(ws.spaces.length < MAX_SPACES ? [{ id: "import", group: "Actions", label: "Import collection…", detail: "Postman, OpenAPI, .http or Quack backup", icon: <Icon d={ICONS.download} />, run: () => void importFile(ws) }] : []),
      { id: "export-space", group: "Actions", label: "Export space…", detail: ws.space.name, icon: <Icon d={ICONS.download} />, run: () => void exportSpace(ws, ws.space) },
      ws.space.folder
        ? { id: "unlink-folder", group: "Actions", label: "Stop syncing with folder", detail: folderName(ws.space), icon: <Icon d={ICONS.folder} />, run: () => unlinkFolder(ws, ws.space) }
        : { id: "save-folder", group: "Actions", label: "Save space to folder…", detail: "Plain files you can commit", icon: <Icon d={ICONS.folder} />, run: () => void saveToFolder(ws) },
      ...(ws.spaces.length < MAX_SPACES ? [{ id: "open-folder", group: "Actions", label: "Open folder…", detail: "A space saved as files", icon: <Icon d={ICONS.folder} />, run: () => void openFolder(ws) }] : []),
      { id: "backup", group: "Actions", label: "Back up all spaces…", icon: <Icon d={ICONS.download} />, run: () => void backupAll(ws) },
    );
    out.push({ id: "env-new", group: "Actions", label: "New environment", icon: <Icon d={ICONS.plus} />, run: () => ws.addEnv() });
    for (const t of THEMES)
      out.push({ id: `theme-${t.id}`, group: "Appearance", label: `Theme: ${t.name}`, detail: `for ${ws.space.name}`, icon: <SpaceDot theme={t.id} className="size-3" />, run: () => ws.setSpaceTheme(ws.space.id, t.id) });
    for (const m of MODES) out.push({ id: `mode-${m.id}`, group: "Appearance", label: `Mode: ${m.name}`, icon: <Icon d={ICONS.palette} />, run: () => onMode(m.id) });
    out.push(
      { id: "theme-all", group: "Appearance", label: "Use this theme for all spaces", icon: <Icon d={ICONS.palette} />, run: () => ws.setAllThemes(ws.space.theme) },
      { id: "glow", group: "Appearance", label: "Toggle glow", icon: <Icon d={ICONS.palette} />, run: onToggleGlow },
      { id: "shortcuts", group: "Help", label: "Keyboard shortcuts", icon: <Icon d={ICONS.keyboard} />, hint: "Ctrl /", run: onShortcuts },
      { id: "issue", group: "Help", label: "Report an issue", detail: "Opens GitHub in your browser", icon: <Icon d={ICONS.alert} />, run: () => openLink(issueUrl()) },
      { id: "github", group: "Help", label: "Quack on GitHub", detail: `Version ${VERSION}`, icon: <Icon d={ICONS.code} />, run: () => openLink(REPO) },
    );
    return out;
  }, [ws, onMode, onToggleGlow, onShortcuts]);

  const shown = useMemo(() => {
    const terms = q.toLowerCase().split(/\s+/).filter(Boolean);
    // Themes only show up when searched for, to keep the default list short.
    const hits = terms.length ? items.filter((it) => terms.every((t) => `${it.label} ${it.detail ?? ""} ${it.group}`.toLowerCase().includes(t))) : items.filter((it) => it.group !== "Appearance" && it.group !== "Help");
    return hits.slice(0, 40);
  }, [q, items]);

  useEffect(() => setSel(0), [q]);
  useEffect(() => {
    list.current?.querySelector(`[data-i="${sel}"]`)?.scrollIntoView({ block: "nearest" });
  }, [sel]);

  if (!open) return null;

  const run = (it?: Item) => {
    if (!it) return;
    onClose();
    it.run();
  };

  let lastGroup = "";
  return (
    <div className="palette-backdrop fixed inset-0 z-50 flex items-start justify-center pt-[14vh]" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="palette w-[min(580px,calc(100vw-32px))] overflow-hidden" role="dialog" aria-label="Command bar">
        <div className="flex items-center gap-3 border-b border-line px-4">
          <Icon d={ICONS.search} className="size-4 text-muted" />
          <input
            ref={input}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") {
                e.preventDefault();
                setSel((s) => Math.min(s + 1, shown.length - 1));
              } else if (e.key === "ArrowUp") {
                e.preventDefault();
                setSel((s) => Math.max(s - 1, 0));
              } else if (e.key === "Enter") {
                e.preventDefault();
                run(shown[sel]);
              } else if (e.key === "Escape") {
                onClose();
              }
            }}
            placeholder="Search requests, spaces and actions…"
            spellCheck={false}
            className="h-13 flex-1 bg-transparent text-[15px] text-text outline-none placeholder:text-muted"
          />
          <span className="kbd kbd-quiet">Esc</span>
        </div>
        <div ref={list} className="palette-list max-h-[52vh] overflow-auto p-1.5">
          {shown.length === 0 && <div className="px-3 py-6 text-center text-sm text-muted">Nothing matches “{q}”</div>}
          {shown.map((it, i) => {
            const head = it.group !== lastGroup ? it.group : null;
            lastGroup = it.group;
            return (
              <div key={it.id}>
                {head && <div className="label px-3 pt-2.5 pb-1">{head}</div>}
                <button
                  type="button"
                  data-i={i}
                  onMouseMove={() => setSel(i)}
                  onClick={() => run(it)}
                  className={`palette-item flex h-10 w-full items-center gap-3 rounded-[calc(var(--r-box)-2px)] px-3 text-left ${i === sel ? "on" : ""}`}
                >
                  <span className="flex w-9 shrink-0 items-center">{it.icon}</span>
                  <span className="max-w-[55%] shrink-0 truncate text-[13.5px] font-medium">{it.label}</span>
                  {it.detail && <span className="min-w-0 truncate text-[12px] text-muted">{it.detail}</span>}
                  {it.hint && <span className="kbd kbd-quiet ml-auto shrink-0">{it.hint}</span>}
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

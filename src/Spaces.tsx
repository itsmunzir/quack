import { useEffect, useRef, useState, type CSSProperties, type PointerEvent, type ReactNode } from "react";
import { MAX_SPACES, reqTitle, useWorkspace, type Req, type Space } from "./store";
import {
  Chevron,
  formatBytes,
  Icon,
  ICONS,
  InlineEdit,
  Menu,
  MenuItem,
  methodColor,
  MethodBadge,
  methodShort,
  RequestEditor,
  ResponseView,
  SpaceDot,
  statusTone,
  UrlBar,
  useClickOutside,
  WindowControls,
} from "./ui";
import appIcon from "./assets/icon.svg";
import { EnvPicker } from "./Envs";
import { HistoryList } from "./HistoryList";
import { exportSpace, importFile } from "./files";
import { folderName, openFolder, saveToFolder, unlinkFolder } from "./sync";

/**
 * The window: a canvas that glows in the space's theme accent, a sidebar of
 * requests, and one card with request and response side by side.
 */
export function Spaces({
  appearance,
  menu,
  openPalette,
  showHistory,
  onToggleHistory,
}: {
  appearance: ReactNode;
  menu: ReactNode;
  openPalette: () => void;
  showHistory: boolean;
  onToggleHistory: () => void;
}) {
  const ws = useWorkspace();
  const [renaming, setRenaming] = useState(false);

  return (
    <div className="relative grid h-full grid-cols-[248px_1fr] bg-bg">
      <div className="canvas pointer-events-none absolute inset-0" />

      <aside className="relative flex min-h-0 flex-col gap-3 px-3 pb-3">
        <div data-tauri-drag-region className="flex h-11 shrink-0 items-center gap-2 px-1.5">
          <img src={appIcon} alt="" className="pointer-events-none size-5" />
          <span className="pointer-events-none text-[13px] font-semibold tracking-tight">Quack</span>
        </div>

        <button type="button" onClick={openPalette} className="glass press flex h-9 items-center gap-2 rounded-btn px-3 text-[13px] text-muted">
          <Icon d={ICONS.search} />
          Search or run…
          <span className="kbd ml-auto bg-text/6">Ctrl K</span>
        </button>

        <Pins />

        <div className="flex items-center justify-between px-1.5 pt-1">
          {renaming ? (
            <InlineEdit
              value={ws.space.name}
              className="text-[12px] font-semibold"
              onDone={(v) => {
                if (v?.trim()) ws.renameSpace(ws.space.id, v.trim());
                setRenaming(false);
              }}
            />
          ) : (
            <SpaceMenu onRename={() => setRenaming(true)} />
          )}
          <div className="flex shrink-0 items-center gap-0.5">
            <button
              type="button"
              onClick={onToggleHistory}
              aria-pressed={showHistory}
              className={`btn btn-ghost btn-icon size-6 ${showHistory ? "!bg-raised !text-text" : ""}`}
              title="History (Ctrl H)"
              aria-label="History"
            >
              <Icon d={ICONS.clock} />
            </button>
            <button type="button" onClick={ws.addReq} className="btn btn-ghost btn-icon size-6" title="New request (Ctrl N)" aria-label="New request">
              <Icon d={ICONS.plus} />
            </button>
          </div>
        </div>

        {showHistory ? (
          <HistoryList />
        ) : (
          <nav className="-mx-1 flex min-h-0 flex-1 flex-col gap-0.5 overflow-auto px-1">
            {ws.space.requests.map((r) => (
              <ReqRow key={r.id} r={r} space={ws.space} />
            ))}
          </nav>
        )}

        <div className="flex items-center justify-between pl-1.5">
          <SpaceDots />
          {menu}
        </div>
      </aside>

      <Notice />

      <section className="relative flex min-h-0 min-w-0 flex-col pr-2 pb-2">
        <div data-tauri-drag-region className="flex h-11 shrink-0 items-center gap-2 pl-1">
          <div className="pointer-events-none flex min-w-0 items-center gap-1.5 text-[12.5px]">
            <span className="text-muted">{ws.space.name}</span>
            <span className="text-muted/60">›</span>
            <span className="truncate font-medium">{reqTitle(ws.req)}</span>
          </div>
          <div data-tauri-drag-region className="h-full flex-1" />
          <EnvPicker />
          {appearance}
          <div className="-mr-2 h-full">
            <WindowControls />
          </div>
        </div>
        <Card />
      </section>
    </div>
  );
}

const DEFAULT_SPLIT = 0.46;

function Card() {
  const ws = useWorkspace();
  const [split, setSplit] = useState(DEFAULT_SPLIT);
  const grid = useRef<HTMLDivElement>(null);

  const resize = (e: PointerEvent<HTMLDivElement>) => {
    if (!e.currentTarget.hasPointerCapture(e.pointerId) || !grid.current) return;
    const box = grid.current.getBoundingClientRect();
    setSplit(Math.min(0.72, Math.max(0.28, (e.clientX - box.left) / box.width)));
  };

  return (
    <main className="card flex min-h-0 flex-1 flex-col overflow-hidden rounded-[calc(var(--r-box)+2px)] bg-surface">
      <div className="p-3 pb-0">
        <UrlBar req={ws.req} vars={ws.vars} outcome={ws.outcome} onChange={(p) => ws.updateReq(ws.req.id, p)} onSend={() => ws.send()} onCancel={() => ws.cancel(ws.req.id)} />
      </div>
      <div ref={grid} className="split mt-3 grid min-h-0 flex-1 border-t border-line" style={{ "--frac": `${split}fr`, "--rest": `${1 - split}fr` } as CSSProperties}>
        <div className="flex min-h-0 min-w-0 flex-col p-4">
          <RequestEditor req={ws.req} vars={ws.vars} envName={ws.env?.name} result={ws.outcome?.result} onChange={(p) => ws.updateReq(ws.req.id, p)} />
        </div>
        <div
          role="separator"
          aria-orientation="vertical"
          aria-label="Resize panes"
          className="split-handle group flex cursor-col-resize justify-center"
          onPointerDown={(e) => e.currentTarget.setPointerCapture(e.pointerId)}
          onPointerMove={resize}
          onDoubleClick={() => setSplit(DEFAULT_SPLIT)}
        >
          <i className="w-px bg-line transition-[background-color,width] duration-150 group-hover:w-0.5 group-hover:bg-accent group-active:w-0.5 group-active:bg-accent" />
        </div>
        <div className="flex min-h-0 min-w-0 flex-col p-4">
          <ResponseView outcome={ws.outcome} meta={(r) => <Chips status={r.status} reason={r.statusReason} ms={r.elapsedMs} size={r.sizeBytes} />} />
        </div>
      </div>
    </main>
  );
}

function Chips({ status, reason, ms, size }: { status: number; reason: string | null; ms: number; size: number }) {
  const tone = `var(--${statusTone(status)})`;
  return (
    <div className="flex items-center gap-1.5 font-mono text-[11.5px]">
      <span className="chip font-semibold" style={{ color: tone, background: `color-mix(in oklab, ${tone} 14%, transparent)` }}>
        <span className="size-1.5 rounded-full" style={{ background: tone }} />
        {status} {reason}
      </span>
      <span className="chip bg-raised text-muted">{ms} ms</span>
      <span className="chip bg-raised text-muted">{formatBytes(size)}</span>
    </div>
  );
}

function ReqRow({ r, space }: { r: Req; space: Space }) {
  const ws = useWorkspace();
  const [renaming, setRenaming] = useState(false);
  const hover = "opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100";
  return (
    <div className={`req-row group flex h-9 shrink-0 items-center gap-1 rounded-btn pr-1.5 text-[13px] ${r.id === ws.req.id ? "on" : ""}`}>
      {renaming ? (
        <div className="flex min-w-0 flex-1 items-center gap-2.5 pl-2.5">
          <MethodBadge method={r.method} />
          <InlineEdit
            value={r.name}
            placeholder={reqTitle(r)}
            className="flex-1 text-[13px]"
            onDone={(v) => {
              if (v !== null) ws.updateReq(r.id, { name: v.trim() });
              setRenaming(false);
            }}
          />
        </div>
      ) : (
        <button
          type="button"
          onClick={() => ws.selectReq(space.id, r.id)}
          onDoubleClick={() => setRenaming(true)}
          className="flex h-full min-w-0 flex-1 items-center gap-2.5 pl-2.5 text-left"
          title="Double-click to rename"
        >
          <MethodBadge method={r.method} />
          <span className="truncate">{reqTitle(r)}</span>
        </button>
      )}
      <RowButton label={r.pinned ? "Unpin" : "Pin"} icon={ICONS.pin} filled={r.pinned} className={r.pinned ? "text-muted" : hover} onClick={() => ws.updateReq(r.id, { pinned: !r.pinned })} />
      <RowButton label="Delete" icon={ICONS.x} className={hover} onClick={() => ws.deleteReq(r.id)} />
    </div>
  );
}

function RowButton({ label, icon, filled, className, onClick }: { label: string; icon: string; filled?: boolean; className: string; onClick: () => void }) {
  return (
    <button type="button" aria-label={label} title={label} onClick={onClick} className={`grid size-6 shrink-0 place-items-center rounded-sm text-muted hover:bg-text/8 hover:text-text ${className}`}>
      <Icon d={icon} className="size-3" filled={filled} />
    </button>
  );
}

/** Pinned requests from every space, always one click away. */
function Pins() {
  const ws = useWorkspace();
  const pins = ws.spaces.flatMap((s) => s.requests.filter((r) => r.pinned).map((r) => ({ r, s }))).slice(0, 8);
  if (!pins.length) return null;
  return (
    <div className="grid grid-cols-2 gap-1.5">
      {pins.map(({ r, s }) => (
        <button
          key={r.id}
          type="button"
          title={`${reqTitle(r)} · ${s.name}`}
          onClick={() => ws.selectReq(s.id, r.id)}
          className={`pin glass press flex h-11 min-w-0 flex-col justify-center gap-px rounded-btn px-2.5 text-left ${r.id === ws.req.id ? "on" : ""}`}
        >
          <span className="font-mono text-[9.5px] font-semibold" style={{ color: methodColor(r.method) }}>
            {methodShort(r.method)}
          </span>
          <span className="truncate text-[12px] leading-tight">{reqTitle(r)}</span>
        </button>
      ))}
    </div>
  );
}

function SpaceDots() {
  const ws = useWorkspace();
  return (
    <div className="flex items-center gap-2.5">
      {ws.spaces.map((s, i) => {
        const on = s.id === ws.space.id;
        return (
          <button
            key={s.id}
            type="button"
            aria-label={`${s.name} (Ctrl ${i + 1})`}
            aria-current={on}
            title={`${s.name} (Ctrl ${i + 1})`}
            onClick={() => ws.selectSpace(s.id)}
            className={`grid size-4 place-items-center rounded-full transition-opacity duration-200 ${on ? "" : "opacity-40 hover:opacity-80"}`}
          >
            <SpaceDot theme={s.theme} className={`size-2.5 ${on ? "outline outline-1 outline-offset-2 outline-text/30" : ""}`} />
          </button>
        );
      })}
      {ws.spaces.length < MAX_SPACES && (
        <button type="button" onClick={ws.addSpace} className="grid size-5 place-items-center rounded-full text-muted hover:bg-text/8 hover:text-text" title="New space" aria-label="New space">
          <Icon d={ICONS.plus} className="size-3" />
        </button>
      )}
    </div>
  );
}

/** The space name doubles as a menu: switch, add, rename, delete. */
function SpaceMenu({ onRename }: { onRename: () => void }) {
  const ws = useWorkspace();
  const [open, setOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const close = () => {
    setOpen(false);
    setConfirmDelete(false);
  };
  const ref = useClickOutside<HTMLDivElement>(close);
  const full = ws.spaces.length >= MAX_SPACES;
  const count = ws.space.requests.length;

  return (
    <div ref={ref} className="relative min-w-0">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => (open ? close() : setOpen(true))}
        onDoubleClick={onRename}
        className="flex max-w-full items-center gap-1.5 rounded-sm px-1.5 py-0.5 text-[12px] font-semibold text-muted transition-colors hover:bg-text/6 hover:text-text"
      >
        <SpaceDot theme={ws.space.theme} />
        <span className="truncate">{ws.space.name}</span>
        <Chevron className="size-3 shrink-0 opacity-60" />
      </button>
      {open && (
        <Menu width="w-56">
          <div className="label px-2.5 pt-1.5 pb-1">Spaces</div>
          {ws.spaces.map((s, i) => (
            <MenuItem
              key={s.id}
              active={s.id === ws.space.id}
              onClick={() => {
                ws.selectSpace(s.id);
                close();
              }}
            >
              <SpaceDot theme={s.theme} />
              <span className="flex-1 truncate text-[13px]">{s.name}</span>
              {s.folder && <Icon d={ICONS.folder} className="size-3 shrink-0 text-muted" />}
              <span className="kbd kbd-quiet">Ctrl {i + 1}</span>
            </MenuItem>
          ))}
          <MenuItem
            onClick={() => {
              if (full) return;
              ws.addSpace();
              close();
            }}
          >
            <Icon d={ICONS.plus} className="size-3 text-muted" />
            <span className={`flex-1 text-[13px] ${full ? "text-muted" : ""}`}>{full ? `Up to ${MAX_SPACES} spaces` : "New space"}</span>
          </MenuItem>
          {!full && (
            <MenuItem
              onClick={() => {
                close();
                void importFile(ws);
              }}
            >
              <Icon d={ICONS.download} className="size-3 text-muted" />
              <span className="flex-1 text-[13px]">Import collection…</span>
            </MenuItem>
          )}
          {!full && (
            <MenuItem
              onClick={() => {
                close();
                void openFolder(ws);
              }}
            >
              <Icon d={ICONS.folder} className="size-3 text-muted" />
              <span className="flex-1 text-[13px]">Open folder…</span>
            </MenuItem>
          )}
          <div className="my-1 border-t border-line" />
          {ws.space.folder ? (
            <MenuItem
              onClick={() => {
                close();
                unlinkFolder(ws, ws.space);
              }}
            >
              <span className="flex-1 truncate text-[13px]" title={ws.space.folder}>
                Stop syncing <span className="text-muted">{folderName(ws.space)}</span>
              </span>
            </MenuItem>
          ) : (
            <MenuItem
              onClick={() => {
                close();
                void saveToFolder(ws);
              }}
            >
              <span className="flex-1 text-[13px]">Save to folder…</span>
            </MenuItem>
          )}
          <MenuItem
            onClick={() => {
              close();
              void exportSpace(ws, ws.space);
            }}
          >
            <span className="flex-1 text-[13px]">Export space…</span>
          </MenuItem>
          <MenuItem
            onClick={() => {
              close();
              onRename();
            }}
          >
            <span className="flex-1 text-[13px]">Rename</span>
          </MenuItem>
          {ws.spaces.length > 1 && (
            <MenuItem
              onClick={() => {
                if (!confirmDelete) return setConfirmDelete(true);
                ws.deleteSpace(ws.space.id);
                close();
              }}
            >
              <span className="flex-1 text-[13px] text-err">{confirmDelete ? `Delete ${count} request${count === 1 ? "" : "s"}? Click again` : "Delete space"}</span>
            </MenuItem>
          )}
        </Menu>
      )}
    </div>
  );
}

/** A brief message at the bottom of the window, like "Imported 12 requests". */
function Notice() {
  const ws = useWorkspace();
  const { notice, dismissNotice } = ws;
  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(dismissNotice, 4000);
    return () => clearTimeout(t);
  }, [notice, dismissNotice]);
  if (!notice) return null;
  return (
    <div key={notice.seq} role="status" className="pop pointer-events-none absolute bottom-5 left-1/2 z-40 max-w-[min(520px,80vw)] -translate-x-1/2 rounded-box border border-line bg-surface px-4 py-2.5 text-[13px] shadow-[0_16px_40px_-12px_rgb(0_0_0/0.3)]">
      {notice.text}
    </div>
  );
}

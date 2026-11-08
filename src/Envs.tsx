import { useState } from "react";
import { useWorkspace } from "./store";
import { Chevron, Icon, ICONS, KVEditor, Menu, useClickOutside } from "./ui";

/** Picks the space's active environment and edits its variables. */
export function EnvPicker() {
  const ws = useWorkspace();
  const { space, env } = ws;
  const [open, setOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const close = () => {
    setOpen(false);
    setConfirmDelete(false);
  };
  const ref = useClickOutside<HTMLDivElement>(close);

  const chip = (on: boolean) =>
    `voice h-7 rounded-btn px-3 text-[12px] font-medium transition-colors ${on ? "bg-selected text-text shadow-[0_0_0_1px_var(--line)]" : "text-muted hover:bg-raised hover:text-text"}`;

  return (
    <div ref={ref} className="relative">
      <button type="button" aria-expanded={open} onClick={() => (open ? close() : setOpen(true))} className="btn btn-ghost voice h-8 gap-2 px-3 text-xs" title="Environment (Ctrl E)">
        <Icon d={ICONS.braces} className={`size-3.5 ${env ? "text-accent" : ""}`} />
        {env?.name ?? "No environment"}
        <Chevron className="size-3 opacity-60" />
      </button>
      {open && (
        <Menu align="right" width="w-[420px]">
          <div className="flex flex-wrap items-center gap-1 p-1.5">
            {space.envs.map((e) => (
              <button key={e.id} type="button" onClick={() => ws.selectEnv(e.id)} className={chip(e.id === env?.id)}>
                {e.name || "Untitled"}
              </button>
            ))}
            <button type="button" onClick={() => ws.selectEnv(null)} className={chip(!env)}>
              None
            </button>
            <button type="button" onClick={ws.addEnv} className="btn btn-ghost btn-icon ml-auto size-7" title="New environment" aria-label="New environment">
              <Icon d={ICONS.plus} />
            </button>
          </div>

          {env ? (
            <div className="border-t border-line px-2 pt-2 pb-1">
              <div className="flex items-center gap-2">
                <input
                  value={env.name}
                  onChange={(e) => ws.updateEnv(env.id, { name: e.target.value })}
                  placeholder="Environment name"
                  spellCheck={false}
                  aria-label="Environment name"
                  className="h-8 min-w-0 flex-1 rounded-[6px] bg-transparent px-2 text-[13px] font-semibold outline-none transition-colors hover:bg-raised/70 focus:bg-raised"
                />
                <button
                  type="button"
                  onClick={() => (confirmDelete ? (ws.deleteEnv(env.id), setConfirmDelete(false)) : setConfirmDelete(true))}
                  className={`btn btn-ghost h-7 px-2.5 text-xs ${confirmDelete ? "!text-err" : ""}`}
                >
                  {confirmDelete ? "Click again to delete" : "Delete"}
                </button>
              </div>
              <KVEditor rows={env.vars} onChange={(vars) => ws.updateEnv(env.id, { vars })} keyLabel="Variable" />
            </div>
          ) : (
            <p className="border-t border-line px-3.5 py-3 text-[12.5px] text-muted">
              {space.envs.length ? "Pick an environment to fill in variables." : "Environments hold values like a base URL or token, per space."}
            </p>
          )}
          <p className="px-3.5 pt-1 pb-2 text-[11.5px] text-muted">
            Write <code className="font-mono text-text">{"{{name}}"}</code> in a URL, header or body. <span className="kbd kbd-quiet ml-1">Ctrl E</span> switches.
          </p>
        </Menu>
      )}
    </div>
  );
}

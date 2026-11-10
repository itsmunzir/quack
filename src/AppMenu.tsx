import { useState, type ReactNode } from "react";
import { MAX_SPACES, useWorkspace } from "./store";
import { backupAll, exportSpace, importFile } from "./files";
import { Icon, ICONS, Menu, MenuItem, useClickOutside } from "./ui";
import { issueUrl, openLink, RELEASES, REPO, VERSION } from "./links";

/**
 * The one menu for everything that isn't about the current request: moving data in and out,
 * help, and the version. Appearance stays in the theme picker at the top.
 */
export function AppMenu({ onShortcuts }: { onShortcuts: () => void }) {
  const ws = useWorkspace();
  const [open, setOpen] = useState(false);
  const ref = useClickOutside<HTMLDivElement>(() => setOpen(false));
  const pick = (action: () => void) => () => {
    setOpen(false);
    action();
  };

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        aria-expanded={open}
        aria-haspopup="menu"
        onClick={() => setOpen((o) => !o)}
        className={`btn btn-ghost btn-icon size-7 ${open ? "!bg-raised !text-text" : ""}`}
        title="Menu"
        aria-label="Menu"
      >
        <Icon d={ICONS.gear} className="size-4" />
      </button>
      {open && (
        <Menu up align="right" width="w-56">
          {ws.spaces.length < MAX_SPACES && (
            <Item icon={ICONS.download} onClick={pick(() => void importFile(ws))}>
              Import collection…
            </Item>
          )}
          <Item icon={ICONS.download} onClick={pick(() => void exportSpace(ws, ws.space))}>
            Export {ws.space.name}…
          </Item>
          <Item icon={ICONS.download} onClick={pick(() => void backupAll(ws))}>
            Back up all spaces…
          </Item>
          <Divider />
          <Item icon={ICONS.keyboard} hint="Ctrl /" onClick={pick(onShortcuts)}>
            Shortcuts
          </Item>
          <Item icon={ICONS.alert} external onClick={pick(() => openLink(issueUrl()))}>
            Report an issue
          </Item>
          <Item icon={ICONS.code} external onClick={pick(() => openLink(REPO))}>
            Quack on GitHub
          </Item>
          <Divider />
          <button
            type="button"
            onClick={pick(() => openLink(`${RELEASES}/tag/v${VERSION}`))}
            className="flex h-8 w-full items-center justify-between rounded-btn px-2.5 text-left text-[12px] text-muted transition-colors hover:bg-raised hover:text-text"
            title="See what's new and download updates"
          >
            Quack {VERSION}
            <span className="flex items-center gap-1">
              Releases <Icon d={ICONS.external} className="size-3" />
            </span>
          </button>
        </Menu>
      )}
    </div>
  );
}

function Item({ icon, hint, external, onClick, children }: { icon: string; hint?: string; external?: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <MenuItem onClick={onClick}>
      <Icon d={icon} className="size-3.5 shrink-0 text-muted" />
      <span className="min-w-0 flex-1 truncate text-[13px]">{children}</span>
      {hint && <span className="kbd kbd-quiet">{hint}</span>}
      {external && <Icon d={ICONS.external} className="size-3 text-muted" />}
    </MenuItem>
  );
}

const Divider = () => <div className="mx-1 my-1 border-t border-line" />;

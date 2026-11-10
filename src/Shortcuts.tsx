import { useEffect } from "react";

/** Every keyboard shortcut, as handled in App.tsx. Keep the two in step. */
export const SHORTCUTS: { group: string; keys: [string, string][] }[] = [
  {
    group: "Requests",
    keys: [
      ["Send, or cancel while sending", "Ctrl Enter"],
      ["New request", "Ctrl N"],
      ["Duplicate request", "Ctrl D"],
      ["Search the response", "Ctrl F"],
    ],
  },
  {
    group: "Getting around",
    keys: [
      ["Command bar", "Ctrl K"],
      ["History", "Ctrl H"],
      ["Next environment", "Ctrl E"],
      ["Switch space", "Ctrl 1–9"],
      ["Next theme", "Ctrl Shift T"],
      ["Keyboard shortcuts", "Ctrl /"],
    ],
  },
];

/** Ctrl /: the full list of shortcuts. */
export function Shortcuts({ open, onClose }: { open: boolean; onClose: () => void }) {
  useEffect(() => {
    if (!open) return;
    const key = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="palette-backdrop fixed inset-0 z-50 flex items-start justify-center pt-[14vh]" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="palette w-[min(440px,calc(100vw-32px))] p-2" role="dialog" aria-label="Keyboard shortcuts">
        <div className="flex items-center justify-between px-3 pt-2 pb-1">
          <h2 className="text-sm font-semibold">Keyboard shortcuts</h2>
          <span className="kbd kbd-quiet">Esc</span>
        </div>
        {SHORTCUTS.map((s) => (
          <section key={s.group} className="pt-2">
            <div className="label px-3 pb-1">{s.group}</div>
            {s.keys.map(([what, keys]) => (
              <div key={what} className="flex h-8 items-center justify-between px-3 text-[13px]">
                {what}
                <span className="kbd kbd-quiet">{keys}</span>
              </div>
            ))}
          </section>
        ))}
        <p className="px-3 pt-2 pb-1.5 text-[11px] text-muted">On a Mac, Cmd works wherever Ctrl does.</p>
      </div>
    </div>
  );
}

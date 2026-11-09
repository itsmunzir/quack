import { useState } from "react";
import { ago } from "./history";
import { reqTitle, useWorkspace } from "./store";
import { MethodBadge, statusTone } from "./ui";

/** The space's sent requests, newest first. Clicking one shows its response again. */
export function HistoryList() {
  const ws = useWorkspace();
  const [confirmClear, setConfirmClear] = useState(false);
  const now = Date.now();

  if (!ws.history.length)
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-1 px-4 text-center">
        <div className="text-[13px] font-medium">No history yet</div>
        <div className="text-[12px] text-muted">Requests you send in {ws.space.name} show up here, with their responses.</div>
      </div>
    );

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <nav className="-mx-1 flex min-h-0 flex-1 flex-col gap-0.5 overflow-auto px-1">
        {ws.history.map((h) => {
          const status = h.result?.status;
          return (
            <button
              key={h.id}
              type="button"
              onClick={() => ws.openHistory(h)}
              title={h.req.url}
              className="req-row flex h-9 shrink-0 items-center gap-2.5 rounded-btn px-2.5 text-left text-[13px]"
            >
              <MethodBadge method={h.req.method} />
              <span className="min-w-0 flex-1 truncate">{reqTitle(h.req)}</span>
              <span className="shrink-0 font-mono text-[11px] font-semibold" style={{ color: `var(--${status ? statusTone(status) : "err"})` }}>
                {status ?? "ERR"}
              </span>
              <span className="w-7 shrink-0 text-right text-[11px] text-muted">{ago(h.at, now)}</span>
            </button>
          );
        })}
      </nav>
      <button
        type="button"
        onClick={() => (confirmClear ? (ws.clearHistory(ws.space.id), setConfirmClear(false)) : setConfirmClear(true))}
        onBlur={() => setConfirmClear(false)}
        className={`mt-2 self-start rounded-sm px-2 py-1 text-[12px] transition-colors hover:bg-raised ${confirmClear ? "text-err" : "text-muted hover:text-text"}`}
      >
        {confirmClear ? "Click again to clear" : "Clear history"}
      </button>
    </div>
  );
}

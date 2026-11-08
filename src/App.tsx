import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useWorkspaceState, WorkspaceContext } from "./store";
import { applyGlow, applyTheme, loadGlow, nextTheme } from "./themes";
import { ThemePicker } from "./ui";
import { Palette } from "./Palette";
import { Spaces } from "./Spaces";

export default function App() {
  const ws = useWorkspaceState();
  const [glow, setGlow] = useState(loadGlow);
  const [palette, setPalette] = useState(false);
  const { theme } = ws.space;

  // Layout effect so a space's theme is painted before the first frame, with no flash.
  useLayoutEffect(() => applyTheme(theme), [theme]);
  useEffect(() => applyGlow(glow), [glow]);

  // Registered once; the ref always points at a handler that sees fresh state.
  const onKey = useRef<(e: KeyboardEvent) => void>(undefined);
  onKey.current = (e) => {
    if (!(e.ctrlKey || e.metaKey)) return;
    const key = e.key.toLowerCase();
    const run = (action: () => void) => {
      e.preventDefault();
      action();
    };
    if (e.key === "Enter") run(() => ws.send());
    else if (e.shiftKey && key === "t") run(() => ws.setSpaceTheme(ws.space.id, nextTheme(theme)));
    else if (key === "k") run(() => setPalette((p) => !p));
    else if (key === "n") run(ws.addReq);
    else if (key === "d") run(() => ws.duplicateReq(ws.req.id));
    else if (/^[1-9]$/.test(e.key) && ws.spaces[+e.key - 1]) run(() => ws.selectSpace(ws.spaces[+e.key - 1].id));
  };
  useEffect(() => {
    const listener = (e: KeyboardEvent) => onKey.current?.(e);
    window.addEventListener("keydown", listener);
    return () => window.removeEventListener("keydown", listener);
  }, []);

  return (
    <WorkspaceContext.Provider value={ws}>
      <Spaces
        appearance={
          <ThemePicker
            value={theme}
            spaceName={ws.space.name}
            onChange={(t) => ws.setSpaceTheme(ws.space.id, t)}
            onApplyAll={() => ws.setAllThemes(theme)}
            glow={glow}
            onGlow={setGlow}
          />
        }
        openPalette={() => setPalette(true)}
      />
      <Palette open={palette} onClose={() => setPalette(false)} onToggleGlow={() => setGlow((g) => !g)} />
    </WorkspaceContext.Provider>
  );
}

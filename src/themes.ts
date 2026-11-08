/** Colours live in styles.css; this list only names the themes for the picker. */
export const THEMES = [
  { id: "honey", name: "Honey" },
  { id: "sage", name: "Sage" },
  { id: "periwinkle", name: "Periwinkle" },
  { id: "ink", name: "Ink" },
] as const;

export type ThemeId = (typeof THEMES)[number]["id"];

export const DEFAULT_THEME: ThemeId = "honey";

export const isThemeId = (v: unknown): v is ThemeId => THEMES.some((t) => t.id === v);

export const nextTheme = (id: ThemeId): ThemeId => THEMES[(THEMES.findIndex((t) => t.id === id) + 1) % THEMES.length].id;

/** Each space carries its own theme; this paints the active one. */
export function applyTheme(id: ThemeId) {
  document.documentElement.dataset.theme = id;
}

function read(key: string) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Not fatal: the choice just won't persist.
  }
}

/* ─── Light and dark ────────────────────────────────────────────────────── */

export const MODES = [
  { id: "system", name: "System" },
  { id: "light", name: "Light" },
  { id: "dark", name: "Dark" },
] as const;

export type Mode = (typeof MODES)[number]["id"];

const MODE_KEY = "quack.mode";
const systemDark = window.matchMedia("(prefers-color-scheme: dark)");

export function loadMode(): Mode {
  const v = read(MODE_KEY);
  return MODES.some((m) => m.id === v) ? (v as Mode) : "system";
}

export function applyMode(mode: Mode) {
  document.documentElement.dataset.mode = mode === "system" ? (systemDark.matches ? "dark" : "light") : mode;
  write(MODE_KEY, mode);
}

/** Calls back when the OS switches between light and dark. Returns an unsubscribe. */
export function onSystemModeChange(callback: () => void) {
  systemDark.addEventListener("change", callback);
  return () => systemDark.removeEventListener("change", callback);
}

/* ─── Glow ──────────────────────────────────────────────────────────────── */

const GLOW_KEY = "quack.glow";

/** Glow washes the window in the theme's accent. On unless turned off. */
export const loadGlow = () => read(GLOW_KEY) !== "off";

export function applyGlow(on: boolean) {
  document.documentElement.dataset.glow = on ? "on" : "off";
  write(GLOW_KEY, on ? "on" : "off");
}

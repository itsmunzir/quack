/** Colours live in styles.css; this list only names the themes for the picker. */
export const THEMES = [
  { id: "paper", name: "Paper", hint: "Crisp and bright", dark: false },
  { id: "field", name: "Field", hint: "Instrument panel", dark: false },
  { id: "mochi", name: "Mochi", hint: "Soft pastels", dark: false },
  { id: "midnight", name: "Midnight", hint: "Quiet and precise", dark: true },
  { id: "neon", name: "Neon", hint: "Indigo night", dark: true },
  { id: "ember", name: "Ember", hint: "Warm retro", dark: true },
  { id: "mocha", name: "Mocha", hint: "Catppuccin", dark: true },
  { id: "rosepine", name: "Rosé Pine", hint: "Soho vibes", dark: true },
  { id: "black", name: "Black", hint: "Pitch dark", dark: true },
] as const;

export type ThemeId = (typeof THEMES)[number]["id"];

export const isThemeId = (v: unknown): v is ThemeId => THEMES.some((t) => t.id === v);

export const nextTheme = (id: ThemeId): ThemeId => THEMES[(THEMES.findIndex((t) => t.id === id) + 1) % THEMES.length].id;

/** Each space carries its own theme; this paints the active one. */
export function applyTheme(id: ThemeId) {
  document.documentElement.dataset.theme = id;
}

const GLOW_KEY = "quack.glow";

/** Glow washes the window in the theme's accent. On unless turned off. */
export function loadGlow(): boolean {
  try {
    return localStorage.getItem(GLOW_KEY) !== "off";
  } catch {
    return true;
  }
}

export function applyGlow(on: boolean) {
  document.documentElement.dataset.glow = on ? "on" : "off";
  try {
    localStorage.setItem(GLOW_KEY, on ? "on" : "off");
  } catch {
    // Not fatal: the choice just won't persist.
  }
}

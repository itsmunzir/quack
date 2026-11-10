import { openUrl } from "@tauri-apps/plugin-opener";
import { isTauri } from "./api";

export const VERSION = __APP_VERSION__;
export const REPO = "https://github.com/itsmunzir/quack";
export const RELEASES = `${REPO}/releases`;

/** Opens a page in the user's browser. Only links to the Quack repo are allowed (see capabilities). */
export function openLink(url: string) {
  if (isTauri) void openUrl(url);
  else window.open(url, "_blank", "noopener");
}

function osName() {
  const ua = navigator.userAgent;
  if (/Windows/.test(ua)) return "Windows";
  if (/Mac OS X|Macintosh/.test(ua)) return "macOS";
  if (/Linux|X11/.test(ua)) return "Linux";
  return "";
}

/**
 * A new bug report with the version and system filled in. Nothing is sent from the app:
 * the form opens in the browser, and the user sees and submits it themselves.
 */
export function issueUrl() {
  const q = new URLSearchParams({ template: "bug.yml", version: VERSION });
  const os = osName();
  if (os) q.set("os", os);
  return `${REPO}/issues/new?${q}`;
}

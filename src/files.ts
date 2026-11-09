import { invoke } from "@tauri-apps/api/core";
import { isTauri } from "./api";
import { importText, toBackup } from "./importers";
import { MAX_SPACES, type Space, type Workspace } from "./store";

const IMPORT_FILTERS = [{ name: "Collections and specs", extensions: ["json", "yaml", "yml"] }];
const EXPORT_FILTERS = [{ name: "JSON", extensions: ["json"] }];
const message = (e: unknown) => (e instanceof Error ? e.message : String(e));
const baseName = (path: string) => path.split(/[\\/]/).pop() || path;

/** Asks for a Postman, OpenAPI or Quack file and adds what it holds as new spaces. */
export async function importFile(ws: Workspace) {
  if (!isTauri) return ws.notify("Importing needs the desktop app.");
  const { open } = await import("@tauri-apps/plugin-dialog");
  const path = await open({ multiple: false, directory: false, filters: IMPORT_FILTERS });
  if (typeof path !== "string") return;
  try {
    const { kind, spaces } = importText(await invoke<string>("read_text_file", { path }));
    const added = ws.importSpaces(spaces);
    if (!added) return ws.notify(`No room for another space. Quack holds up to ${MAX_SPACES}.`);
    if (added < spaces.length) return ws.notify(`Imported ${added} of ${spaces.length} spaces. Quack holds up to ${MAX_SPACES}.`);
    const count = spaces.reduce((n, s) => n + s.requests.length, 0);
    ws.notify(spaces.length === 1 ? `Imported ${kind} “${spaces[0].name}”, ${count} request${count === 1 ? "" : "s"}.` : `Imported ${spaces.length} spaces from a ${kind}.`);
  } catch (e) {
    ws.notify(message(e));
  }
}

/** Saves spaces as a Quack backup file. It includes environment values and auth, so it can hold secrets. */
export async function exportSpaces(ws: Workspace, spaces: Space[], suggestedName: string) {
  if (!isTauri) return ws.notify("Exporting needs the desktop app.");
  const { save } = await import("@tauri-apps/plugin-dialog");
  const path = await save({ defaultPath: suggestedName, filters: EXPORT_FILTERS });
  if (!path) return;
  try {
    await invoke("write_text_file", { path, contents: toBackup(spaces) });
    ws.notify(`Saved ${spaces.length === 1 ? `“${spaces[0].name}”` : `${spaces.length} spaces`} to ${baseName(path)}.`);
  } catch (e) {
    ws.notify(message(e));
  }
}

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "space";

export const exportSpace = (ws: Workspace, sp: Space) => exportSpaces(ws, [sp], `${slug(sp.name)}.quack.json`);
export const backupAll = (ws: Workspace) => exportSpaces(ws, ws.spaces, `quack-backup-${new Date().toISOString().slice(0, 10)}.json`);

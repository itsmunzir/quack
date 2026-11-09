import { invoke } from "@tauri-apps/api/core";
import { useEffect, useRef } from "react";
import { isTauri } from "./api";
import { fromFiles, MANIFEST, slug, toFiles, type Files } from "./folder";
import { MAX_SPACES, type Space, type Workspace } from "./store";

interface FolderContents {
  files: Files;
  empty: boolean;
}

const message = (e: unknown) => (e instanceof Error ? e.message : String(e));
const baseName = (path: string) => path.split(/[\\/]/).filter(Boolean).pop() || path;
const samePath = (a: string, b: string) => a.replace(/[\\/]+$/, "").replace(/\\/g, "/").toLowerCase() === b.replace(/[\\/]+$/, "").replace(/\\/g, "/").toLowerCase();

/**
 * What each linked space's folder holds, as far as Quack knows, by space id.
 * A space is only written once it has an entry, so nothing on disk is overwritten before it has been read.
 */
const known = new Map<string, Files>();

/** Spaces with a write on its way, which mustn't be read back half-written. */
const writing = new Set<string>();

const read = (path: string) => invoke<FolderContents>("read_folder", { path });

/**
 * What to remember after reading a folder. Files that only differ in formatting count as already
 * written, so a hand-edited file isn't rewritten until something in it changes. Files Quack wouldn't
 * write are kept so the next save removes them; ones it would write but are missing get written.
 */
function remember(disk: Files, normal: Files): Files {
  const out: Files = {};
  for (const p of Object.keys(normal)) if (p in disk) out[p] = normal[p];
  for (const p of Object.keys(disk)) if (!(p in normal)) out[p] = disk[p];
  return out;
}

const same = (a: Files, b: Files) => {
  const ka = Object.keys(a);
  return ka.length === Object.keys(b).length && ka.every((k) => a[k] === b[k]);
};

function unlink(ws: Workspace, sp: Space, why: string) {
  known.delete(sp.id);
  ws.setFolder(sp.id, undefined);
  ws.notify(`Stopped syncing “${sp.name}”: ${why}`);
}

/** Reads a linked space's folder and takes in changes made outside Quack, like a git pull. */
export async function pull(ws: Workspace, sp: Space) {
  if (!sp.folder || writing.has(sp.id)) return;
  const last = known.get(sp.id);
  // Unsaved edits win; they'll be written in a moment.
  if (last && !same(toFiles(sp), last)) return;
  let disk: Files;
  try {
    disk = (await read(sp.folder)).files;
  } catch (e) {
    return unlink(ws, sp, message(e));
  }
  if (last && same(disk, last)) return;
  try {
    const next = fromFiles(disk, sp);
    const normal = toFiles(next);
    known.set(sp.id, remember(disk, normal));
    if (!same(normal, toFiles(sp))) ws.replaceSpace(sp.id, next);
  } catch (e) {
    // A broken file: say so, and leave both the space and the folder as they are until it's fixed.
    known.delete(sp.id);
    ws.notify(`Couldn't read “${sp.name}”: ${message(e)}`);
  }
}

/** Writes what changed in a linked space since Quack last read or wrote its folder. */
export async function push(ws: Workspace, sp: Space) {
  const last = known.get(sp.id);
  if (!sp.folder || !last) return;
  const now = toFiles(sp);
  const files: Files = {};
  for (const [p, text] of Object.entries(now)) if (last[p] !== text) files[p] = text;
  const remove = Object.keys(last).filter((p) => !(p in now));
  if (!Object.keys(files).length && !remove.length) return;
  known.set(sp.id, now);
  writing.add(sp.id);
  try {
    await invoke("write_folder", { path: sp.folder, files, remove });
  } catch (e) {
    unlink(ws, sp, message(e));
  } finally {
    writing.delete(sp.id);
  }
}

/** Keeps linked spaces and their folders in step: reads on start and whenever the window comes back, writes shortly after each edit. */
export function useFolderSync(ws: Workspace) {
  const linked = ws.spaces.filter((s) => s.folder);
  const latest = useRef(ws);
  latest.current = ws;

  useEffect(() => {
    if (!isTauri) return;
    const pullAll = () => latest.current.spaces.forEach((sp) => void pull(latest.current, sp));
    pullAll();
    window.addEventListener("focus", pullAll);
    return () => window.removeEventListener("focus", pullAll);
  }, []);

  useEffect(() => {
    if (!isTauri || !linked.length) return;
    const t = setTimeout(() => linked.forEach((sp) => void push(ws, sp)), 300);
    return () => clearTimeout(t);
  }, [ws.spaces]);
}

/* ─── Commands ──────────────────────────────────────────────────────────── */

async function pickFolder(title: string): Promise<string | null> {
  const { open } = await import("@tauri-apps/plugin-dialog");
  const path = await open({ directory: true, multiple: false, title });
  return typeof path === "string" ? path : null;
}

/** Saves the current space as a folder of files and keeps it in sync from then on. */
export async function saveToFolder(ws: Workspace) {
  if (!isTauri) return ws.notify("Saving to a folder needs the desktop app.");
  const sp = ws.space;
  const dir = await pickFolder(`Choose where to keep “${sp.name}”`);
  if (!dir) return;
  try {
    const here = await read(dir);
    if (MANIFEST in here.files) return ws.notify(`${baseName(dir)} already holds a Quack space. Open it with Open folder instead.`);
    let target = dir;
    // Into an empty folder directly; otherwise into a new folder named after the space.
    if (!here.empty) {
      target = `${dir.replace(/[\\/]+$/, "")}${dir.includes("\\") ? "\\" : "/"}${slug(sp.name)}`;
      await invoke("create_folder", { path: target });
    }
    known.set(sp.id, {});
    ws.setFolder(sp.id, target);
    ws.notify(`Saved “${sp.name}” to ${baseName(target)}. Changes save there as you go.`);
  } catch (e) {
    ws.notify(message(e));
  }
}

/** Opens a folder saved by Quack as a space that stays in sync with it. */
export async function openFolder(ws: Workspace) {
  if (!isTauri) return ws.notify("Opening a folder needs the desktop app.");
  const dir = await pickFolder("Open a Quack folder");
  if (!dir) return;
  const open = ws.spaces.find((s) => s.folder && samePath(s.folder, dir));
  if (open) return ws.selectSpace(open.id);
  try {
    const { files } = await read(dir);
    const sp = { ...fromFiles(files), folder: dir };
    known.set(sp.id, remember(files, toFiles(sp)));
    if (!ws.openSpace(sp)) {
      known.delete(sp.id);
      ws.notify(`No room for another space. Quack holds up to ${MAX_SPACES}.`);
    }
  } catch (e) {
    ws.notify(message(e));
  }
}

/** Stops syncing a space. Its files stay where they are. */
export function unlinkFolder(ws: Workspace, sp: Space) {
  known.delete(sp.id);
  ws.setFolder(sp.id, undefined);
  ws.notify(`“${sp.name}” no longer syncs. Its files stay in ${baseName(sp.folder ?? "")}.`);
}

export const folderName = (sp: Space) => (sp.folder ? baseName(sp.folder) : "");

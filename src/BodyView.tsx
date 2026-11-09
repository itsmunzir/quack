import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { readPath } from "./capture";
import { Icon, ICONS } from "./ui";

/* ─── Line model ────────────────────────────────────────────────────────── */

/** A run of text with an optional highlight class; `path` makes a JSON key clickable. */
interface Seg {
  t: string;
  c?: string;
  path?: string;
}

interface Line {
  segs: Seg[];
  depth: number;
  /** Lines of the objects and arrays this line sits inside, outermost first. */
  parents: number[];
  /** On a line that opens an object or array: where it closes, and what to show when folded. */
  end?: number;
  summary?: string;
  close?: string;
}

const IDENT = /^[A-Za-z_$][\w$]*$/;

/** `data.items[0]["odd key"]`, the same syntax Capture reads. */
export function childPath(path: string, key: string | number): string {
  if (typeof key === "number") return `${path}[${key}]`;
  if (IDENT.test(key)) return path ? `${path}.${key}` : key;
  return `${path}[${JSON.stringify(key)}]`;
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** Lays JSON out as pretty-printed lines, two spaces per level, the way JSON.stringify would. */
export function jsonLines(value: unknown, base = ""): Line[] {
  const out: Line[] = [];
  const walk = (v: unknown, key: string | number | undefined, path: string, depth: number, comma: boolean, parents: number[]) => {
    const head: Seg[] = typeof key === "string" ? [{ t: JSON.stringify(key), c: "j-key", path }, { t: ": " }] : [];
    const tail: Seg[] = comma ? [{ t: "," }] : [];
    if (v !== null && typeof v === "object") {
      const arr = Array.isArray(v);
      const entries: [string | number, unknown][] = arr ? v.map((x, i) => [i, x]) : Object.entries(v);
      const [open, shut] = arr ? ["[", "]"] : ["{", "}"];
      if (!entries.length) {
        out.push({ segs: [...head, { t: open + shut }, ...tail], depth, parents });
        return;
      }
      const start = out.length;
      out.push({ segs: [...head, { t: open }], depth, parents, summary: arr ? plural(entries.length, "item", "items") : plural(entries.length, "key", "keys"), close: shut + (comma ? "," : "") });
      const inner = [...parents, start];
      entries.forEach(([k, x], i) => walk(x, arr ? undefined : k, childPath(path, k), depth + 1, i < entries.length - 1, inner));
      out.push({ segs: [{ t: shut }, ...tail], depth, parents: inner });
      out[start].end = out.length - 1;
      return;
    }
    const c = typeof v === "string" ? "j-str" : typeof v === "number" ? "j-num" : "j-lit";
    out.push({ segs: [...head, { t: JSON.stringify(v), c }, ...tail], depth, parents });
  };
  walk(value, undefined, base, 0, false, []);
  return out;
}

const textLines = (text: string): Line[] => text.split("\n").map((t) => ({ segs: [{ t }], depth: 0, parents: [] }));
const lineText = (l: Line) => l.segs.map((s) => s.t).join("");

interface Match {
  line: number;
  from: number;
  to: number;
}

export function findAll(lines: Line[], query: string): Match[] {
  const q = query.toLowerCase();
  if (!q) return [];
  const out: Match[] = [];
  lines.forEach((l, line) => {
    const text = lineText(l).toLowerCase();
    for (let i = text.indexOf(q); i >= 0; i = text.indexOf(q, i + q.length)) out.push({ line, from: i, to: i + q.length });
  });
  return out;
}

/** Splits a line's runs at the search matches, wrapping matched text in <mark>. */
function paint(segs: Seg[], marks: Match[], current: Match | undefined, onKey: (path: string) => void): ReactNode[] {
  const nodes: ReactNode[] = [];
  let at = 0;
  segs.forEach((s, si) => {
    const start = at;
    const stops = new Set([0, s.t.length]);
    for (const m of marks) {
      if (m.from > start && m.from < start + s.t.length) stops.add(m.from - start);
      if (m.to > start && m.to < start + s.t.length) stops.add(m.to - start);
    }
    const cuts = [...stops].sort((a, b) => a - b);
    const parts = cuts.slice(0, -1).map((a, i) => {
      const text = s.t.slice(a, cuts[i + 1]);
      const hit = marks.find((m) => m.from <= start + a && m.to >= start + cuts[i + 1]);
      return hit ? (
        <mark key={i} className={hit === current ? "cur" : undefined} data-cur={hit === current || undefined}>
          {text}
        </mark>
      ) : (
        text
      );
    });
    const key = `${si}`;
    if (s.path !== undefined)
      nodes.push(
        <span key={key} className={`${s.c} cursor-pointer hover:underline`} title={`${s.path} (click to copy the path)`} onClick={() => onKey(s.path!)}>
          {parts}
        </span>,
      );
    else nodes.push(s.c ? <span key={key} className={s.c}>{parts}</span> : <span key={key}>{parts}</span>);
    at += s.t.length;
  });
  return nodes;
}

/* ─── View ──────────────────────────────────────────────────────────────── */

/** Above this many lines, nested blocks start folded so the view stays quick. */
const FOLD_OVER = 3000;

function parse(text: string): { ok: true; value: unknown } | { ok: false } {
  try {
    return { ok: true, value: JSON.parse(text) };
  } catch {
    return { ok: false };
  }
}

/** A response body: folding JSON, search, a `$.path` filter, raw text, and images. */
export function BodyView({ text, image }: { text: string; image?: string }) {
  const parsed = useMemo(() => parse(text), [text]);
  const [raw, setRaw] = useState(false);
  const [query, setQuery] = useState("");
  const [copied, setCopied] = useState<string | null>(null);
  const isPath = parsed.ok && !raw && query.trim().startsWith("$");

  const lines = useMemo(() => {
    if (!parsed.ok || raw) return textLines(text);
    if (isPath) {
      const v = readPath(parsed.value, query);
      return v === undefined ? [] : jsonLines(v, query.trim().replace(/^\$\.?/, ""));
    }
    return jsonLines(parsed.value);
  }, [parsed, raw, text, isPath, isPath && query]);

  const [folded, setFolded] = useState<Set<number>>(new Set());
  useEffect(() => {
    setFolded(new Set(lines.length > FOLD_OVER ? lines.flatMap((l, i) => (l.end !== undefined && l.depth >= 1 ? [i] : [])) : []));
  }, [lines]);

  const matches = useMemo(() => (isPath ? [] : findAll(lines, query)), [lines, query, isPath]);
  const [cur, setCur] = useState(0);
  useEffect(() => setCur(0), [matches]);
  const current = matches[cur];

  const scroller = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!current) return;
    // Open whatever hides the current match, then bring it into view.
    const hiding = lines[current.line].parents.filter((p) => folded.has(p));
    if (hiding.length) return setFolded((f) => new Set([...f].filter((p) => !hiding.includes(p))));
    scroller.current?.querySelector("[data-cur]")?.scrollIntoView({ block: "center" });
  }, [current, folded]);

  useEffect(() => {
    if (!copied) return;
    const t = setTimeout(() => setCopied(null), 1600);
    return () => clearTimeout(t);
  }, [copied]);

  const copyPath = (path: string) => void navigator.clipboard.writeText(path).then(() => setCopied(path));
  const step = (by: number) => matches.length && setCur((c) => (c + by + matches.length) % matches.length);
  const toggle = (i: number) => setFolded((f) => (f.has(i) ? new Set([...f].filter((x) => x !== i)) : new Set(f).add(i)));

  if (image)
    return (
      <div className="enter flex h-full min-h-40 items-center justify-center p-4">
        <img src={image} alt="Response image" className="checker max-h-full max-w-full rounded-[6px] object-contain shadow-[0_0_0_1px_var(--line)]" />
      </div>
    );

  const byLine = new Map<number, Match[]>();
  for (const m of matches) byLine.set(m.line, [...(byLine.get(m.line) ?? []), m]);

  const rows: ReactNode[] = [];
  const gutter = String(lines.length).length;
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    const isFolded = folded.has(i) && l.end !== undefined;
    rows.push(
      <div key={i} className="line flex">
        <span className="flex shrink-0 items-start justify-end gap-0.5 pr-2 text-muted/45 select-none" style={{ width: `${gutter + 3}ch` }}>
          {i + 1}
          {l.end !== undefined ? (
            <button type="button" onClick={() => toggle(i)} className="fold" aria-label={isFolded ? "Unfold" : "Fold"} aria-expanded={!isFolded}>
              <Icon d="M6 4l4 4-4 4" className={`size-3 transition-transform duration-150 ${isFolded ? "" : "rotate-90"}`} />
            </button>
          ) : (
            <span className="w-3" />
          )}
        </span>
        <span className="min-w-0 flex-1 break-all whitespace-pre-wrap" style={{ paddingLeft: `${l.depth * 2}ch` }}>
          {paint(l.segs, byLine.get(i) ?? [], current, copyPath)}
          {isFolded && (
            <>
              <button type="button" onClick={() => toggle(i)} className="folded">
                … <span className="text-muted">{l.summary}</span> …
              </button>
              {l.close}
            </>
          )}
          {!l.segs.some((s) => s.t) && " "}
        </span>
      </div>,
    );
    if (isFolded) i = l.end!;
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 items-center gap-1.5 border-b border-line px-2 py-1.5">
        <Icon d={ICONS.search} className="size-3.5 shrink-0 text-muted" />
        <input
          data-response-search
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") step(e.shiftKey ? -1 : 1);
            if (e.key === "Escape") setQuery("");
          }}
          placeholder={parsed.ok && !raw ? "Search, or $.path to filter" : "Search"}
          spellCheck={false}
          aria-label="Search the response"
          className="h-7 min-w-0 flex-1 bg-transparent font-mono text-[12.5px] outline-none placeholder:font-sans placeholder:text-muted/70"
        />
        {copied ? (
          <span className="voice truncate text-[11.5px] text-muted">
            Copied <code className="font-mono text-text">{copied}</code>
          </span>
        ) : query && !isPath ? (
          <>
            <span className="shrink-0 font-mono text-[11.5px] text-muted">{matches.length ? `${cur + 1} of ${matches.length}` : "No matches"}</span>
            <button type="button" onClick={() => step(-1)} disabled={!matches.length} className="btn btn-ghost btn-icon size-6" aria-label="Previous match" title="Previous (Shift Enter)">
              <Icon d="M4 10l4-4 4 4" className="size-3" />
            </button>
            <button type="button" onClick={() => step(1)} disabled={!matches.length} className="btn btn-ghost btn-icon size-6" aria-label="Next match" title="Next (Enter)">
              <Icon d="M4 6l4 4 4-4" className="size-3" />
            </button>
          </>
        ) : isPath && !lines.length ? (
          <span className="shrink-0 text-[11.5px] text-muted">Nothing at that path</span>
        ) : null}
        {parsed.ok && (
          <button type="button" onClick={() => setRaw((r) => !r)} aria-pressed={raw} className={`voice h-6 shrink-0 rounded-btn px-2 text-[11px] font-medium transition-colors ${raw ? "bg-selected text-text shadow-[0_0_0_1px_var(--line)]" : "text-muted hover:bg-raised hover:text-text"}`}>
            Raw
          </button>
        )}
      </div>
      <div ref={scroller} className="json min-h-0 flex-1 overflow-auto py-2 pr-3 font-mono text-[13px] leading-relaxed">
        {rows}
      </div>
    </div>
  );
}

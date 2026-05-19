"use client";

import React from "react";
import { diffLines, diffWordsWithSpace } from "diff";

type Props = {
  oldText: string;
  newText: string;
  /** Unified (default) renders inline ± lines; split renders side-by-side. */
  mode?: "unified" | "split";
  /** Show only changed regions with N context lines around them. */
  contextLines?: number;
};

type LineChange = {
  kind: "add" | "remove" | "equal";
  text: string;
};

function buildLineChanges(oldText: string, newText: string): LineChange[] {
  const parts = diffLines(oldText, newText, { newlineIsToken: false });
  const out: LineChange[] = [];
  for (const part of parts) {
    const lines = part.value.split(/\r?\n/);
    // diffLines emits trailing empty token after a newline; trim it.
    if (lines.length > 0 && lines[lines.length - 1] === "") lines.pop();
    const kind: LineChange["kind"] = part.added ? "add" : part.removed ? "remove" : "equal";
    for (const line of lines) {
      out.push({ kind, text: line });
    }
  }
  return out;
}

function collapseEqualRuns(changes: LineChange[], context: number): LineChange[] {
  if (context <= 0) return changes.filter((c) => c.kind !== "equal");
  const out: LineChange[] = [];
  let i = 0;
  while (i < changes.length) {
    const c = changes[i];
    if (c.kind !== "equal") {
      out.push(c);
      i++;
      continue;
    }
    // Find run of consecutive equals
    let j = i;
    while (j < changes.length && changes[j].kind === "equal") j++;
    const run = changes.slice(i, j);

    if (i === 0) {
      // Leading equals: show only last `context`.
      const tail = run.slice(Math.max(0, run.length - context));
      if (run.length > tail.length) {
        out.push({ kind: "equal", text: `··· ${run.length - tail.length} unchanged line(s) ···` });
      }
      out.push(...tail);
    } else if (j === changes.length) {
      // Trailing equals: show only first `context`.
      out.push(...run.slice(0, context));
      if (run.length > context) {
        out.push({ kind: "equal", text: `··· ${run.length - context} unchanged line(s) ···` });
      }
    } else if (run.length <= 2 * context) {
      out.push(...run);
    } else {
      out.push(...run.slice(0, context));
      out.push({ kind: "equal", text: `··· ${run.length - 2 * context} unchanged line(s) ···` });
      out.push(...run.slice(run.length - context));
    }
    i = j;
  }
  return out;
}

function renderWordDiff(oldLine: string, newLine: string): React.ReactNode {
  const parts = diffWordsWithSpace(oldLine, newLine);
  return parts.map((p, i) => {
    if (p.added) {
      return (
        <span key={i} className="bg-emerald-200/70 dark:bg-emerald-700/40 rounded-sm px-0.5">
          {p.value}
        </span>
      );
    }
    if (p.removed) {
      return (
        <span key={i} className="bg-rose-200/70 dark:bg-rose-700/40 rounded-sm px-0.5 line-through opacity-70">
          {p.value}
        </span>
      );
    }
    return <span key={i}>{p.value}</span>;
  });
}

export function WikiDraftDiff({ oldText, newText, mode = "unified", contextLines = 3 }: Props) {
  const changes = React.useMemo(() => buildLineChanges(oldText, newText), [oldText, newText]);
  const visible = React.useMemo(() => collapseEqualRuns(changes, contextLines), [changes, contextLines]);

  if (oldText === newText) {
    return (
      <p className="text-xs text-muted-foreground italic px-2 py-3">
        No changes between the current page and the proposed content.
      </p>
    );
  }

  if (mode === "split") {
    return <SplitDiff oldText={oldText} newText={newText} />;
  }

  return (
    <div className="font-mono text-xs leading-relaxed">
      {visible.map((c, i) => {
        if (c.kind === "equal") {
          if (c.text.startsWith("···")) {
            return (
              <div key={i} className="text-muted-foreground/60 text-center py-1 select-none">
                {c.text}
              </div>
            );
          }
          return (
            <div key={i} className="text-muted-foreground/70 px-2 whitespace-pre-wrap">
              <span className="text-muted-foreground/40 mr-2 select-none">·</span>
              {c.text || " "}
            </div>
          );
        }
        if (c.kind === "add") {
          return (
            <div
              key={i}
              className="bg-emerald-50 dark:bg-emerald-950/30 text-emerald-900 dark:text-emerald-200 px-2 whitespace-pre-wrap border-l-2 border-emerald-400"
            >
              <span className="text-emerald-600 dark:text-emerald-400 mr-2 select-none">+</span>
              {c.text || " "}
            </div>
          );
        }
        return (
          <div
            key={i}
            className="bg-rose-50 dark:bg-rose-950/30 text-rose-900 dark:text-rose-200 px-2 whitespace-pre-wrap border-l-2 border-rose-400"
          >
            <span className="text-rose-600 dark:text-rose-400 mr-2 select-none">−</span>
            {c.text || " "}
          </div>
        );
      })}
    </div>
  );
}

function SplitDiff({ oldText, newText }: { oldText: string; newText: string }) {
  // Pair lines naively — for short diffs this is fine; for long ones we still
  // render but the eye will scan the unified mode.
  const oldLines = oldText.split(/\r?\n/);
  const newLines = newText.split(/\r?\n/);
  const max = Math.max(oldLines.length, newLines.length);

  return (
    <div className="grid grid-cols-2 gap-0 font-mono text-xs leading-relaxed">
      <div className="border-r border-border">
        <div className="px-2 py-1 text-[10px] uppercase tracking-wide bg-muted/50 sticky top-0">Current</div>
        {Array.from({ length: max }).map((_, i) => {
          const o = oldLines[i] ?? "";
          const n = newLines[i] ?? "";
          const changed = o !== n;
          return (
            <div
              key={`o${i}`}
              className={`px-2 whitespace-pre-wrap ${
                changed ? "bg-rose-50 dark:bg-rose-950/30 text-rose-900 dark:text-rose-200" : ""
              }`}
            >
              {changed && o ? renderWordDiff(o, n) : o || " "}
            </div>
          );
        })}
      </div>
      <div>
        <div className="px-2 py-1 text-[10px] uppercase tracking-wide bg-muted/50 sticky top-0">Proposed</div>
        {Array.from({ length: max }).map((_, i) => {
          const o = oldLines[i] ?? "";
          const n = newLines[i] ?? "";
          const changed = o !== n;
          return (
            <div
              key={`n${i}`}
              className={`px-2 whitespace-pre-wrap ${
                changed ? "bg-emerald-50 dark:bg-emerald-950/30 text-emerald-900 dark:text-emerald-200" : ""
              }`}
            >
              {changed && n ? renderWordDiff(o, n) : n || " "}
            </div>
          );
        })}
      </div>
    </div>
  );
}

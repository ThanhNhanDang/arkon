"use client";

import React from "react";
import { api } from "@/lib/api";
import { DraftResponse } from "@/types/wiki";
import { WikiContent } from "./wiki-content";
import { WikiDraftDiff } from "./wiki-draft-diff";
import { WikiAiCheckPanel } from "./wiki-ai-check-panel";
import { Button } from "@/components/ui/button";

type Props = {
  drafts: DraftResponse[];
  /** Current content of the parent page, used for the diff tab. */
  currentContent?: string;
  onApproved: (draftId: string) => void;
  onRejected: (draftId: string) => void;
  onChangesRequested?: (draftId: string) => void;
};

type ReviewerAction = "approve" | "reject" | "request_changes";
type BannerTab = "diff" | "proposed" | "current";

const MIN_NOTE_LENGTH = 20;
const AI_POLL_INTERVAL_MS = 3000;

export function WikiDraftBanner({
  drafts,
  currentContent = "",
  onApproved,
  onRejected,
  onChangesRequested,
}: Props) {
  const [idx, setIdx] = React.useState(0);
  const [tab, setTab] = React.useState<BannerTab>("diff");
  const [actionMode, setActionMode] = React.useState<ReviewerAction | null>(null);
  const [note, setNote] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [liveDraft, setLiveDraft] = React.useState<DraftResponse | null>(null);

  const baseDraft = drafts[idx];
  const draft = liveDraft && baseDraft && liveDraft.id === baseDraft.id ? liveDraft : baseDraft;
  if (!draft) return null;

  const isCreate = draft.draft_kind === "create";
  const isNeedsRevision = draft.status === "needs_revision";
  const isWithdrawn = draft.status === "withdrawn";
  const hasConflict = draft.has_conflict;
  const aiRunning = draft.ai_check_status === "pending" || draft.ai_check_status === "running";

  // Reset live snapshot when the user pages to a different draft.
  React.useEffect(() => {
    setLiveDraft(null);
  }, [baseDraft?.id]);

  // Poll the single draft while AI checks are still running.
  React.useEffect(() => {
    if (!draft.id || !aiRunning) return;
    const id = setInterval(async () => {
      try {
        const fresh = await api<DraftResponse>(`/api/wiki/drafts/${draft.id}`);
        setLiveDraft(fresh);
        if (fresh.ai_check_status !== "pending" && fresh.ai_check_status !== "running") {
          clearInterval(id);
        }
      } catch {
        /* silent — next tick retries */
      }
    }, AI_POLL_INTERVAL_MS);
    return () => clearInterval(id);
  }, [draft.id, aiRunning]);

  const total = drafts.length;

  const resetForm = () => {
    setActionMode(null);
    setNote("");
    setError(null);
  };

  const handleApprove = async () => {
    setBusy(true);
    setError(null);
    try {
      await api(`/api/wiki/drafts/${draft.id}/approve`, {
        method: "POST",
        body: { allow_conflict: hasConflict ? true : undefined },
      });
      onApproved(draft.id);
      setIdx((i) => Math.max(0, i - 1));
      resetForm();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Approve failed");
    } finally {
      setBusy(false);
    }
  };

  const handleNoteSubmit = async () => {
    if (note.trim().length < MIN_NOTE_LENGTH) {
      setError(`Please write at least ${MIN_NOTE_LENGTH} characters explaining your decision.`);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      if (actionMode === "reject") {
        await api(`/api/wiki/drafts/${draft.id}/reject`, {
          method: "POST",
          body: { reviewer_note: note },
        });
        onRejected(draft.id);
      } else if (actionMode === "request_changes") {
        await api(`/api/wiki/drafts/${draft.id}/request-changes`, {
          method: "POST",
          body: { reviewer_note: note },
        });
        onChangesRequested?.(draft.id);
      }
      resetForm();
      setIdx((i) => Math.max(0, i - 1));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Action failed");
    } finally {
      setBusy(false);
    }
  };

  const authorLabel = draft.author_name ?? "Unknown";
  const dateLabel = new Date(draft.created_at).toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
  });

  // Color palette differs by draft state so reviewers can scan the queue.
  const palette = isNeedsRevision
    ? {
        wrap: "border-blue-300/60 bg-blue-50/80 dark:bg-blue-950/20 dark:border-blue-700/40",
        icon: "edit_note",
        iconClass: "text-blue-600 dark:text-blue-400",
        text: "text-blue-900 dark:text-blue-200",
        muted: "text-blue-700 dark:text-blue-400",
        chip: "bg-blue-300/70 dark:bg-blue-700/50 text-blue-900 dark:text-blue-100",
        chipHover: "text-blue-700 dark:text-blue-400 hover:bg-blue-100/60 dark:hover:bg-blue-800/30",
        hover: "hover:bg-blue-200/60 dark:hover:bg-blue-800/40",
        border: "border-blue-200/60 dark:border-blue-700/30",
        tabBorder: "border-blue-300/70 dark:border-blue-700/40",
        primaryBtn: "bg-blue-600 hover:bg-blue-700 text-white",
      }
    : {
        wrap: "border-amber-300/60 bg-amber-50/80 dark:bg-amber-950/20 dark:border-amber-700/40",
        icon: "pending",
        iconClass: "text-amber-600 dark:text-amber-400",
        text: "text-amber-900 dark:text-amber-200",
        muted: "text-amber-700 dark:text-amber-400",
        chip: "bg-amber-300/70 dark:bg-amber-700/50 text-amber-900 dark:text-amber-100",
        chipHover: "text-amber-700 dark:text-amber-400 hover:bg-amber-100/60 dark:hover:bg-amber-800/30",
        hover: "hover:bg-amber-200/60 dark:hover:bg-amber-800/40",
        border: "border-amber-200/60 dark:border-amber-700/30",
        tabBorder: "border-amber-300/70 dark:border-amber-700/40",
        primaryBtn: "bg-amber-600 hover:bg-amber-700 text-white",
      };

  const headlineLabel = isNeedsRevision
    ? `Waiting for ${authorLabel} to revise`
    : isWithdrawn
    ? `Withdrawn by ${authorLabel}`
    : `Pending draft by ${authorLabel}`;

  const notePrompt =
    actionMode === "request_changes"
      ? "Explain what the author should change before resubmitting…"
      : "Tell the contributor why this draft was rejected…";

  const noteLabel =
    actionMode === "request_changes"
      ? "Request changes — note to author (required)"
      : "Rejection reason (required)";

  return (
    <div className={`rounded-xl border ${palette.wrap} overflow-hidden shadow-sm`}>
      {/* Header */}
      <div className={`flex items-center gap-3 px-4 py-3 border-b ${palette.border}`}>
        <span className={`material-symbols-outlined ${palette.iconClass}`} style={{ fontSize: 18 }}>
          {palette.icon}
        </span>
        <div className="flex-1 min-w-0">
          <p className={`text-sm font-medium ${palette.text} flex flex-wrap items-center gap-2`}>
            <span>{headlineLabel}</span>
            <span className={`font-normal ${palette.muted}`}>· {dateLabel}</span>
            {draft.revision_round > 0 && (
              <span className={`text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded ${palette.chip}`}>
                round {draft.revision_round}
              </span>
            )}
            {hasConflict && (
              <span className="text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded bg-destructive/15 text-destructive">
                conflict — page advanced past v{draft.base_version ?? "?"} to v{draft.page_version}
              </span>
            )}
          </p>
          {draft.note && (
            <p className={`text-xs ${palette.muted} truncate mt-0.5`}>&ldquo;{draft.note}&rdquo;</p>
          )}
          {isNeedsRevision && draft.last_returned_note && (
            <p className={`text-xs ${palette.muted} mt-1`}>
              <span className="font-medium">Reviewer asked:</span> {draft.last_returned_note}
            </p>
          )}
        </div>

        {/* Pagination */}
        {total > 1 && (
          <div className="flex items-center gap-1 shrink-0">
            <button
              type="button"
              onClick={() => setIdx((i) => Math.max(0, i - 1))}
              disabled={idx === 0}
              className={`w-6 h-6 flex items-center justify-center rounded ${palette.hover} disabled:opacity-30 transition-colors`}
            >
              <span className="material-symbols-outlined" style={{ fontSize: 14 }}>chevron_left</span>
            </button>
            <span className={`text-xs ${palette.muted} tabular-nums`}>{idx + 1}/{total}</span>
            <button
              type="button"
              onClick={() => setIdx((i) => Math.min(total - 1, i + 1))}
              disabled={idx === total - 1}
              className={`w-6 h-6 flex items-center justify-center rounded ${palette.hover} disabled:opacity-30 transition-colors`}
            >
              <span className="material-symbols-outlined" style={{ fontSize: 14 }}>chevron_right</span>
            </button>
          </div>
        )}
      </div>

      {/* Suggested metadata (create drafts only) */}
      {isCreate && draft.suggested_metadata && (
        <div className={`px-4 pt-3 text-xs ${palette.muted} space-y-0.5`}>
          <p>
            <span className="font-medium">Slug:</span> <code>{draft.suggested_metadata.slug}</code> ·{" "}
            <span className="font-medium">Type:</span> {draft.suggested_metadata.page_type} ·{" "}
            <span className="font-medium">Scope:</span> {draft.suggested_metadata.scope_type}
          </p>
          {!!draft.suggested_metadata.knowledge_type_slugs?.length && (
            <p>
              <span className="font-medium">Tags:</span>{" "}
              {draft.suggested_metadata.knowledge_type_slugs.join(", ")}
            </p>
          )}
        </div>
      )}

      {/* Tab toggle */}
      <div className="flex gap-1 px-4 pt-3">
        {(isCreate
          ? (["proposed"] as const)
          : (["diff", "proposed", "current"] as const)
        ).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={`px-3 py-1 rounded-md text-xs font-medium transition-colors capitalize ${
              tab === t ? palette.chip : palette.chipHover
            }`}
          >
            {t === "proposed" ? "Proposed" : t === "current" ? "Current page" : "Diff"}
          </button>
        ))}
      </div>

      {/* Content preview */}
      <div className="px-4 py-3 max-h-72 overflow-y-auto">
        {tab === "diff" && !isCreate ? (
          <WikiDraftDiff
            oldText={currentContent}
            newText={draft.content_md}
            mode="unified"
            contextLines={3}
          />
        ) : tab === "proposed" || isCreate ? (
          draft.content_md.trim() ? (
            <WikiContent markdown={draft.content_md} />
          ) : (
            <p className={`text-sm ${palette.muted} italic`}>Empty content.</p>
          )
        ) : (
          <div className="text-xs">
            <WikiContent markdown={currentContent || "_(empty page)_"} />
          </div>
        )}
      </div>

      {/* AI pre-review summary */}
      <WikiAiCheckPanel
        status={draft.ai_check_status}
        results={draft.ai_check_results}
      />

      {/* Reject / Request-changes note field */}
      {actionMode === "reject" || actionMode === "request_changes" ? (
        <div className="px-4 pb-3">
          <label className={`block text-xs font-medium ${palette.text} mb-1`}>{noteLabel}</label>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={3}
            placeholder={notePrompt}
            className={`w-full rounded-lg border ${palette.tabBorder} bg-white/70 dark:bg-black/20 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-current/20 resize-none placeholder:opacity-60`}
          />
          <p className={`text-[11px] ${palette.muted} mt-1`}>
            {note.trim().length}/{MIN_NOTE_LENGTH} characters minimum
          </p>
        </div>
      ) : null}

      {error && (
        <p className="px-4 pb-2 text-xs text-destructive">{error}</p>
      )}

      {/* Actions */}
      <div className="flex items-center justify-end gap-2 px-4 pb-3">
        {actionMode ? (
          <>
            <Button
              variant="outline"
              size="sm"
              onClick={resetForm}
              disabled={busy}
              className={`border ${palette.tabBorder}`}
            >
              Cancel
            </Button>
            <Button
              size="sm"
              variant={actionMode === "reject" ? "destructive" : "default"}
              onClick={handleNoteSubmit}
              disabled={busy || note.trim().length < MIN_NOTE_LENGTH}
              className={`gap-1.5 ${actionMode === "request_changes" ? palette.primaryBtn : ""}`}
            >
              {busy ? (
                <span className="material-symbols-outlined text-sm animate-spin">progress_activity</span>
              ) : (
                <span className="material-symbols-outlined text-sm">
                  {actionMode === "reject" ? "cancel" : "edit_note"}
                </span>
              )}
              {actionMode === "reject" ? "Confirm Reject" : "Send back"}
            </Button>
          </>
        ) : isNeedsRevision || isWithdrawn ? (
          <p className={`text-xs ${palette.muted} italic`}>
            {isNeedsRevision
              ? "Waiting for the author to resubmit."
              : "This draft is no longer in review."}
          </p>
        ) : (
          <>
            <Button
              variant="outline"
              size="sm"
              onClick={() => { setActionMode("request_changes"); setNote(""); }}
              disabled={busy}
              className={`border ${palette.tabBorder} ${palette.text} ${palette.hover}`}
            >
              <span className="material-symbols-outlined text-sm mr-1">edit_note</span>
              Request changes
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => { setActionMode("reject"); setNote(""); }}
              disabled={busy}
              className={`border ${palette.tabBorder} ${palette.text} ${palette.hover}`}
            >
              <span className="material-symbols-outlined text-sm mr-1">cancel</span>
              Reject
            </Button>
            <Button
              size="sm"
              onClick={handleApprove}
              disabled={busy}
              className={`gap-1.5 ${palette.primaryBtn}`}
            >
              {busy ? (
                <span className="material-symbols-outlined text-sm animate-spin">progress_activity</span>
              ) : (
                <span className="material-symbols-outlined text-sm">check_circle</span>
              )}
              Approve
            </Button>
          </>
        )}
      </div>
    </div>
  );
}

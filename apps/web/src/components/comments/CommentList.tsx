import { Fragment, useState } from "react";
import { useI18n } from "../../hooks/useI18n";
import { formatDate } from "@tsukue/config";
import { tokenizeCommentLines } from "@tsukue/api/render";
import type { PublicComment, PublicCommentThread } from "@tsukue/types";

interface CommentBodyProps {
  body: string;
}

/**
 * Renders a comment as text.
 *
 * React escapes text nodes, and the only element built from a body is an anchor
 * whose href the tokeniser matched as http(s) — so a comment cannot become
 * markup, and there is no `dangerouslySetInnerHTML` anywhere near user input.
 * The tokeniser lives in `@tsukue/api` so the same logic is unit-tested
 * against hostile bodies rather than trusted here.
 */
function CommentBody({ body }: CommentBodyProps) {
  const lines = tokenizeCommentLines(body);

  return (
    <p className="font-sans text-[0.95rem] leading-[1.65] text-ink [overflow-wrap:anywhere]">
      {/* Long unbroken strings (a URL, a pasted token) must not widen the sheet. */}
      {lines.map((tokens, lineIndex) => (
        <Fragment key={lineIndex}>
          {lineIndex > 0 ? <br /> : null}
          {tokens.map((token, tokenIndex) =>
            token.type === "link" ? (
              <a
                key={tokenIndex}
                className="text-accent underline decoration-[1px] underline-offset-2 [overflow-wrap:anywhere]"
                href={token.value}
                rel="noopener noreferrer nofollow"
                target="_blank"
              >
                {token.value}
              </a>
            ) : (
              <Fragment key={tokenIndex}>{token.value}</Fragment>
            ),
          )}
        </Fragment>
      ))}
    </p>
  );
}

function CommentEntry({
  comment,
  lang,
  spaced,
}: {
  comment: PublicComment;
  lang: string;
  spaced?: boolean;
}) {
  const { t } = useI18n(lang);
  const [outcome, setOutcome] = useState<"idle" | "reported" | "failed">(
    "idle",
  );

  /**
   * Flags this comment for a moderator.
   *
   * No challenge is involved, unlike submitting, so this is a plain POST with
   * no widget to wait for — the server bounds it per source instead. The
   * answer says nothing about where the comment sits in moderation, so the only
   * thing this can report back is that the flag was accepted.
   */
  async function report() {
    try {
      const response = await fetch(`/api/comments/${comment.id}/report`, {
        method: "POST",
      });
      setOutcome(response.ok ? "reported" : "failed");
    } catch {
      setOutcome("failed");
    }
  }

  return (
    <li className={spaced ? "mt-6" : undefined}>
      <div className="flex flex-wrap items-baseline gap-[0.6rem] mb-[0.35rem]">
        <span className="font-serif text-base text-ink">
          {comment.authorName}
        </span>
        {/*
          Formatted for the article's language, not the browser's: the same
          comment should not read differently to two people, and letting the
          browser decide is also how a server/client mismatch starts.
        */}
        <time
          className="font-sans text-[0.78rem] text-muted tabular-nums"
          dateTime={comment.createdAt}
        >
          {formatDate(new Date(comment.createdAt), lang)}
        </time>
        {/*
          Not on the author's own replies: there is nobody to report them to,
          and offering it would suggest otherwise.
        */}
        {/*
          The report control, and what it says afterwards.

          Pushed to the end of the meta row (`margin-left: auto`) so it sits away
          from the name and date it belongs to: available without competing with
          them, and easier to ignore than to hit by accident.
        */}
        {comment.isAuthor ? null : outcome === "idle" ? (
          <button
            type="button"
            className="ml-auto border-0 bg-transparent p-0 font-sans text-[0.78rem] text-muted underline cursor-pointer hover:text-accent focus-visible:text-accent"
            onClick={report}
          >
            {t("comment.report")}
          </button>
        ) : (
          <span
            className="ml-auto font-sans text-[0.78rem] text-muted data-[status=failed]:text-accent"
            data-status={outcome}
            role={outcome === "failed" ? "alert" : "status"}
          >
            {outcome === "reported"
              ? t("comment.reported")
              : t("comment.error")}
          </span>
        )}
      </div>
      <CommentBody body={comment.body} />
    </li>
  );
}

interface CommentListProps {
  threads: PublicCommentThread[];
  lang: string;
  /** Rendered when the fetch succeeded and there is genuinely nothing yet. */
  emptyLabel: string;
}

export default function CommentList({
  threads,
  lang,
  emptyLabel,
}: CommentListProps) {
  if (threads.length === 0) {
    return (
      <p className="mb-6 font-sans text-[0.9rem] text-muted">{emptyLabel}</p>
    );
  }

  return (
    <ol>
      {threads.map((thread, index) => (
        <Fragment key={thread.comment.id}>
          <CommentEntry
            comment={thread.comment}
            lang={lang}
            spaced={index > 0 && threads[index - 1].replies.length === 0}
          />
          {thread.replies.length > 0 ? (
            /*
              Replies are set in from the thread they answer, which is the
              only cue the nesting gets — a border here competed with the
              sheet's own edge.
            */
            <ol className="mt-5 border-l-2 border-l-[color-mix(in_srgb,var(--color-muted)_20%,transparent)] pl-5">
              {thread.replies.map((reply) => (
                <CommentEntry
                  key={reply.id}
                  comment={reply}
                  lang={lang}
                  spaced
                />
              ))}
            </ol>
          ) : null}
        </Fragment>
      ))}
    </ol>
  );
}

import { Fragment } from "react";
import { formatDate } from "@tsukue/config";
import { tokenizeCommentLines } from "@tsukue/comments/render";
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
 * The tokeniser lives in `@tsukue/comments` so the same logic is unit-tested
 * against hostile bodies rather than trusted here.
 */
function CommentBody({ body }: CommentBodyProps) {
  const lines = tokenizeCommentLines(body);

  return (
    <p className="comment-body">
      {lines.map((tokens, lineIndex) => (
        <Fragment key={lineIndex}>
          {lineIndex > 0 ? <br /> : null}
          {tokens.map((token, tokenIndex) =>
            token.type === "link" ? (
              <a
                key={tokenIndex}
                className="comment-link"
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
}: {
  comment: PublicComment;
  lang: string;
}) {
  return (
    <li className="comment">
      <div className="comment-meta">
        <span className="comment-author">{comment.authorName}</span>
        {/*
          Formatted for the article's language, not the browser's: the same
          comment should not read differently to two people, and letting the
          browser decide is also how a server/client mismatch starts.
        */}
        <time className="comment-date" dateTime={comment.createdAt}>
          {formatDate(new Date(comment.createdAt), lang)}
        </time>
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
    return <p className="comment-empty">{emptyLabel}</p>;
  }

  return (
    <ol className="comment-list">
      {threads.map((thread) => (
        <Fragment key={thread.comment.id}>
          <CommentEntry comment={thread.comment} lang={lang} />
          {thread.replies.length > 0 ? (
            <ol className="comment-replies">
              {thread.replies.map((reply) => (
                <CommentEntry key={reply.id} comment={reply} lang={lang} />
              ))}
            </ol>
          ) : null}
        </Fragment>
      ))}
    </ol>
  );
}

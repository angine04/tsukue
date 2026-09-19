import { useEffect, useState } from "react";
import type { PublicCommentThread } from "@tsukue/types";
import { useI18n } from "../../hooks/useI18n";
import CommentForm from "./CommentForm";
import CommentList from "./CommentList";

interface CommentsProps {
  slug: string;
  lang: string;
  /** Public Turnstile site key; comments are read-only without one. */
  siteKey: string;
}

type ListState =
  | { status: "loading" }
  | { status: "ready"; threads: PublicCommentThread[] }
  /** The list failed. Nothing is claimed about how many comments exist. */
  | { status: "failed" };

export default function Comments({ slug, lang, siteKey }: CommentsProps) {
  const { t } = useI18n(lang);
  const [list, setList] = useState<ListState>({ status: "loading" });

  useEffect(() => {
    let cancelled = false;
    const query = new URLSearchParams({ slug, lang });

    fetch(`/api/comments?${query.toString()}`)
      .then((response) => {
        if (!response.ok) throw new Error(String(response.status));
        return response.json();
      })
      .then((payload: { data: { threads: PublicCommentThread[] } }) => {
        if (!cancelled) {
          setList({ status: "ready", threads: payload.data.threads });
        }
      })
      .catch(() => {
        if (!cancelled) setList({ status: "failed" });
      });

    return () => {
      cancelled = true;
    };
  }, [slug, lang]);

  return (
    <section className="comments" aria-label={t("comment.title")}>
      <h2 className="comments-title">{t("comment.title")}</h2>

      {list.status === "loading" ? (
        <p className="comment-empty">{t("comment.loading")}</p>
      ) : null}

      {list.status === "ready" ? (
        <CommentList
          threads={list.threads}
          lang={lang}
          emptyLabel={t("comment.noComments")}
        />
      ) : null}

      {/*
        Without a site key there is no widget, so no token, so every submission
        would be refused by the server. Saying so is better than offering a form
        that cannot work.
      */}
      {siteKey ? (
        <CommentForm slug={slug} lang={lang} siteKey={siteKey} />
      ) : (
        <p className="comment-empty">{t("comment.closed")}</p>
      )}
    </section>
  );
}

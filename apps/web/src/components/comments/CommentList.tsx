import { useUI } from "../../hooks/useUI";

interface CommentListProps {
  lang?: string;
}

export default function CommentList({ lang = "en" }: CommentListProps) {
  const { t } = useUI(lang);

  return (
    <div className="space-y-4">
      <div className="card p-4 rounded-lg">
        <p className="text-[var(--color-muted)]">{t("comment.noComments")}</p>
      </div>
    </div>
  );
}

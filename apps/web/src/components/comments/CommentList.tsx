import { useI18n } from "../../hooks/useI18n";

interface CommentListProps {
  lang?: string;
}

export default function CommentList({ lang = "en" }: CommentListProps) {
  const { t } = useI18n(lang);

  return (
    <div className="space-y-4">
      <div className="card p-4 rounded-lg">
        <p className="text-[var(--color-muted)]">{t("comment.noComments")}</p>
      </div>
    </div>
  );
}

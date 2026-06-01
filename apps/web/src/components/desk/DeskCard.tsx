import { useI18n } from "../../hooks/useI18n";

interface DeskCardProps {
  lang?: string;
}

export default function DeskCard({ lang = "en" }: DeskCardProps) {
  const { t } = useI18n(lang);

  return (
    <div className="card p-6 rounded-lg max-w-sm">
      <h2 className="font-serif text-2xl text-[var(--color-ink)]">{t("desk.readArticle")}</h2>
    </div>
  );
}

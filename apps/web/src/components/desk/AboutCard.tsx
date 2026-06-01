import { useI18n } from "../../hooks/useI18n";

interface AboutCardProps {
  lang?: string;
}

export default function AboutCard({ lang = "en" }: AboutCardProps) {
  const { t } = useI18n(lang);

  return (
    <div className="card p-6 rounded-lg max-w-xs border-2 border-[var(--color-accent)]">
      <h2 className="font-serif text-xl text-[var(--color-ink)]">{t("nav.about")}</h2>
      <p className="text-[var(--color-muted)] mt-2">Writer & Engineer</p>
    </div>
  );
}

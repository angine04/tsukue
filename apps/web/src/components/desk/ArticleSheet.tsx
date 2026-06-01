import { useUI } from "../../hooks/useUI";

interface ArticleSheetProps {
  lang?: string;
}

export default function ArticleSheet({ lang = "en" }: ArticleSheetProps) {
  const { t } = useUI(lang);

  return (
    <div className="card p-8 rounded-lg max-w-2xl mx-auto">
      <h1 className="font-serif text-3xl text-[var(--color-ink)] mb-4">
        {t("article.back")}
      </h1>
      <div className="article-content">
        <p>Article content goes here.</p>
      </div>
    </div>
  );
}

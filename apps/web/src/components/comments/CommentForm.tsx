import { useI18n } from "../../hooks/useI18n";

interface CommentFormProps {
  lang?: string;
}

export default function CommentForm({ lang = "en" }: CommentFormProps) {
  const { t } = useI18n(lang);

  return (
    <form className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-[var(--color-ink)]">
          {t("comment.name")}
        </label>
        <input type="text" className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2" />
      </div>
      <div>
        <label className="block text-sm font-medium text-[var(--color-ink)]">
          {t("comment.body")}
        </label>
        <textarea className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2" rows={4} />
      </div>
      <button type="submit" className="bg-[var(--color-accent)] text-white px-4 py-2 rounded-md">
        {t("comment.submit")}
      </button>
    </form>
  );
}

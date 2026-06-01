import { useUI } from "../../hooks/useUI";

interface AdminDashboardProps {
  lang?: string;
}

export default function AdminDashboard({ lang = "en" }: AdminDashboardProps) {
  const { t } = useUI(lang);

  return (
    <div className="admin-dashboard p-8">
      <h1 className="text-2xl font-bold text-[var(--color-ink)] mb-6">{t("admin.title")}</h1>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="card p-4 rounded-lg">
          <h2 className="font-medium text-[var(--color-ink)]">{t("admin.pendingComments")}</h2>
          <p className="text-[var(--color-muted)]">0</p>
        </div>
        <div className="card p-4 rounded-lg">
          <h2 className="font-medium text-[var(--color-ink)]">{t("admin.subscribers")}</h2>
          <p className="text-[var(--color-muted)]">0</p>
        </div>
      </div>
    </div>
  );
}

import { useI18n } from "../../hooks/useI18n";

interface DeskRailProps {
  lang?: string;
}

export default function DeskRail({ lang = "en" }: DeskRailProps) {
  const { t } = useI18n(lang);

  return (
    <div className="flex gap-4 overflow-x-auto">
      <div className="card p-4 min-w-[200px] rounded-lg">{t("desk.scrollLeft")}</div>
      <div className="card p-4 min-w-[200px] rounded-lg">{t("desk.scrollRight")}</div>
      <div className="card p-4 min-w-[200px] rounded-lg">{t("desk.clickToRead")}</div>
    </div>
  );
}

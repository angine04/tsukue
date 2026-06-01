import { useUI } from "../../hooks/useUI";

interface DeskRailProps {
  lang?: string;
}

export default function DeskRail({ lang = "en" }: DeskRailProps) {
  const { t } = useUI(lang);

  return (
    <div className="flex gap-4 overflow-x-auto">
      <div className="card p-4 min-w-[200px] rounded-lg">{t("desk.scrollLeft")}</div>
      <div className="card p-4 min-w-[200px] rounded-lg">{t("desk.scrollRight")}</div>
      <div className="card p-4 min-w-[200px] rounded-lg">{t("desk.clickToRead")}</div>
    </div>
  );
}

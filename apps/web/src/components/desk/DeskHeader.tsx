import { SITE_DESCRIPTION, SITE_NAME, aboutPath } from "@tsukue/config";
import { useI18n } from "../../hooks/useI18n";

interface DeskHeaderProps {
  lang: string;
}

export default function DeskHeader({ lang }: DeskHeaderProps) {
  const { t } = useI18n(lang);

  return (
    <header className="desk-header">
      <div className="desk-wordmark">
        <span className="desk-wordmark-name">{SITE_NAME}</span>
        <span className="desk-wordmark-tagline">{SITE_DESCRIPTION}</span>
      </div>

      <nav className="desk-nav">
        <a href={aboutPath()}>{t("nav.about")}</a>
      </nav>
    </header>
  );
}

import { SITE_NAME, aboutPath } from "@tsukue/config";
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
        {/* The tagline is UI, not metadata: `SITE_DESCRIPTION` stays the site's
            one canonical description for meta tags, while this follows the page
            it is printed on (AGENTS 11.4). */}
        <span className="desk-wordmark-tagline">{t("desk.tagline")}</span>
      </div>

      <nav className="desk-nav">
        <a href={aboutPath()}>{t("nav.about")}</a>
      </nav>
    </header>
  );
}

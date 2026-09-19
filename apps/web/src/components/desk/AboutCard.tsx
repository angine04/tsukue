import { useI18n } from "../../hooks/useI18n";
import NameCard from "./NameCard";

interface AboutCardProps {
  lang?: string;
}

/**
 * The About sheet. Rendered both from the desk and directly at the About
 * route, so it carries no interactivity and needs no hydration.
 */
export default function AboutCard({ lang = "en" }: AboutCardProps) {
  const { t } = useI18n(lang);

  return (
    <div className="about-sheet">
      {/* The page's heading. The eyebrow styling is the page's only label, and
          it was a span, which left the About route with no heading at all. */}
      <h1 className="about-sheet-eyebrow">{t("nav.about").toUpperCase()}</h1>
      <NameCard />
    </div>
  );
}

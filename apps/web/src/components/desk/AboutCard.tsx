import { newsletterPath } from "@tsukue/config";
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
      {/* A plain link, not an island: this sheet's markup is adopted by the desk
          rather than re-rendered, so anything interactive in it would never
          hydrate. It is also the only route to the newsletter — the desk has no
          chrome of its own and there is no site footer to put one in. */}
      <a className="about-sheet-link" href={newsletterPath()}>
        {t("newsletter.title")}
      </a>
    </div>
  );
}

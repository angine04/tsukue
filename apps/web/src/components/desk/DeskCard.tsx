import { motion } from "framer-motion";
import { memo } from "react";
import { useI18n } from "../../hooks/useI18n";
import { cardLayoutId, type DeskItem } from "../../lib/cards";
import NameCard from "./NameCard";

interface DeskCardProps {
  item: DeskItem;
  index: number;
  lang: string;
  focused: boolean;
  /** True while this card's article is the open sheet. */
  expanded: boolean;
  onSelect: (index: number, event: React.MouseEvent<HTMLAnchorElement>) => void;
}

/**
 * A card in the rail.
 *
 * Rotation is animated as a CSS custom property rather than a transform, so the
 * mobile layout can damp it with plain CSS and the server still renders the
 * scattered angle. The rail writes --rail-x onto the slot each frame and the
 * arc, bank and scale are derived from it in CSS, so a scrolling frame costs
 * one property per card.
 *
 * Memoised, and deliberately not given the card's distance from the focus:
 * passing that made every card re-render on every focus change during a scroll.
 * Depth order is applied to the slot by the rail instead.
 *
 * The card leaves the document while its sheet is open. That is not a
 * rendering nicety: Framer's shared-layout animation promotes the arriving
 * element over the departing one only when the departing one unmounts, so a
 * card that stayed put would leave the sheet with no box to grow out of and it
 * would simply appear at full size. The slot stays behind to hold the
 * footprint, or the rail would reflow under the reader as the sheet opens.
 */
function DeskCard({
  item,
  index,
  lang,
  focused,
  expanded,
  onSelect,
}: DeskCardProps) {
  const { t } = useI18n(lang);

  return (
    <li
      className="desk-slot"
      data-slot={index}
      data-variant={item.kind === "article" ? item.variant : "name-card"}
      data-expanded={expanded ? "" : undefined}
    >
      {expanded ? null : (
        <motion.a
          href={item.href}
          className="desk-card"
          data-kind={item.kind}
          data-color={item.kind === "article" ? item.color : "warm-paper"}
          data-variant={item.kind === "article" ? item.variant : "name-card"}
          data-focused={focused ? "" : undefined}
          aria-current={focused ? "true" : undefined}
          layoutId={item.kind === "article" ? cardLayoutId(item) : undefined}
          onClick={(event) => onSelect(index, event)}
          style={
            { "--card-rotation": `${item.rotation}deg` } as React.CSSProperties
          }
        >
          {item.kind === "article" ? (
            <>
              <span className="desk-card-eyebrow">{item.eyebrow}</span>
              <h2 className="desk-card-title">{item.title}</h2>
              <p className="desk-card-description">{item.description}</p>
              <span className="desk-card-date">{item.dateLabel}</span>
            </>
          ) : (
            <>
              <span className="desk-card-eyebrow">
                {t("nav.about").toUpperCase()}
              </span>
              <NameCard name={item.name} role={item.role} />
            </>
          )}
        </motion.a>
      )}
    </li>
  );
}

export default memo(DeskCard);

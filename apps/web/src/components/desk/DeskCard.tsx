import { motion, useReducedMotion } from "framer-motion";
import { useI18n } from "../../hooks/useI18n";
import type { DeskItem } from "../../lib/cards";
import NameCard from "./NameCard";

interface DeskCardProps {
  item: DeskItem;
  index: number;
  lang: string;
  focused: boolean;
  /** Cards further from the focus sit behind their neighbours when they overlap. */
  focusDistance: number;
  onSelect: (index: number, event: React.MouseEvent<HTMLAnchorElement>) => void;
}

/**
 * A card in the rail. Rotation is animated as a CSS custom property rather
 * than a transform, so the mobile layout can damp it with plain CSS and the
 * server still renders the scattered angle. The rail adds --arc-lift, --bank
 * and --rail-scale to the slot each frame; they inherit down to here.
 */
export default function DeskCard({
  item,
  index,
  lang,
  focused,
  focusDistance,
  onSelect,
}: DeskCardProps) {
  const { t } = useI18n(lang);
  const reducedMotion = useReducedMotion();
  const rotation = focused ? 0 : item.rotation;

  return (
    <li
      className="desk-slot"
      data-slot={index}
      style={{ zIndex: 100 - focusDistance }}
    >
      <motion.a
        href={item.href}
        className="desk-card"
        data-kind={item.kind}
        data-color={item.kind === "article" ? item.color : "warm-paper"}
        data-variant={item.kind === "article" ? item.variant : "name-card"}
        data-focused={focused ? "" : undefined}
        aria-current={focused ? "true" : undefined}
        onClick={(event) => onSelect(index, event)}
        initial={false}
        animate={{ "--card-rotation": `${rotation}deg` }}
        transition={
          reducedMotion
            ? { duration: 0 }
            : { type: "spring", stiffness: 240, damping: 28 }
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
    </li>
  );
}

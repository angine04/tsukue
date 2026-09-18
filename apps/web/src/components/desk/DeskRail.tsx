import { useCallback, useEffect, useRef } from "react";
import { useI18n } from "../../hooks/useI18n";
import type { DeskItem } from "../../lib/cards";
import DeskCard from "./DeskCard";

/**
 * The rail is laid out as a straight, scrollable row — that keeps native
 * scrolling, snapping and tab order intact — then each card is displaced onto
 * a curve per frame. A literal `offset-path` would bend the same way, but its
 * arc-length parameterisation cannot be derived from a layout position, so
 * cards would bunch towards the ends. A parabola from the card's normalised
 * distance is exact and costs one multiply.
 */
const ARC_DEPTH_PX = 30;
const ARC_BANK_DEG = 3;
const ARC_SCALE_FALLOFF = 0.04;
const MAX_RAIL_X = 1.5;
const SETTLE_MS = 140;

interface DeskRailProps {
  items: DeskItem[];
  lang: string;
  focusedIndex: number;
  onFocusIndex: (index: number) => void;
}

export default function DeskRail({
  items,
  lang,
  focusedIndex,
  onFocusIndex,
}: DeskRailProps) {
  const { t } = useI18n(lang);
  const railRef = useRef<HTMLUListElement>(null);
  const frameRef = useRef(0);
  const settleRef = useRef(0);
  const nearestRef = useRef(0);
  const railXRef = useRef<number[]>([]);

  const slotAt = useCallback(
    (index: number) =>
      railRef.current?.querySelector<HTMLElement>(`[data-slot="${index}"]`) ??
      null,
    [],
  );

  const centerOn = useCallback(
    (index: number) => {
      const rail = railRef.current;
      const slot = slotAt(index);
      if (!rail || !slot) return;
      const prefersReducedMotion = window.matchMedia(
        "(prefers-reduced-motion: reduce)",
      ).matches;
      rail.scrollTo({
        left: slot.offsetLeft + slot.offsetWidth / 2 - rail.clientWidth / 2,
        behavior: prefersReducedMotion ? "auto" : "smooth",
      });
    },
    [slotAt],
  );

  /**
   * The rail's leading and trailing padding must match the width of the cards
   * actually sitting at each end, because that is what lets them reach the
   * centre. Card widths vary (`wide`, `compact`, `name-card`), and a single
   * --card-width assumption left the narrower About card 56px short of centre.
   */
  const syncRailPadding = useCallback(() => {
    const rail = railRef.current;
    if (!rail) return;
    const cardWidth = (index: number) =>
      slotAt(index)?.querySelector<HTMLElement>(".desk-card")?.offsetWidth;
    const first = cardWidth(0);
    const last = cardWidth(items.length - 1);
    if (first) {
      rail.style.setProperty("--rail-edge-start", `${first}px`);
    }
    if (last) {
      rail.style.setProperty("--rail-edge-end", `${last}px`);
    }
  }, [items.length, slotAt]);

  /**
   * One pass over the cards produces both the focused index and each card's
   * place on the curve. Frames only write CSS custom properties, so scrolling
   * never re-renders React.
   */
  const updateRailGeometry = useCallback(() => {
    const rail = railRef.current;
    if (!rail) return;

    const { length } = items;
    const centre = rail.scrollLeft + rail.clientWidth / 2;
    const half = rail.clientWidth / 2 || 1;

    // Read every box before writing anything: interleaving the two would
    // force a layout flush per card.
    const slots: (HTMLElement | null)[] = [];
    const centres: number[] = [];
    for (let index = 0; index < length; index += 1) {
      const slot = slotAt(index);
      slots.push(slot);
      centres.push(slot ? slot.offsetLeft + slot.offsetWidth / 2 : Number.NaN);
    }

    let nearest = 0;
    let closest = Number.POSITIVE_INFINITY;

    for (let index = 0; index < length; index += 1) {
      const slotCentre = centres[index];
      if (Number.isNaN(slotCentre)) continue;

      const distance = Math.abs(slotCentre - centre);
      if (distance < closest) {
        closest = distance;
        nearest = index;
      }

      const x = Math.max(
        -MAX_RAIL_X,
        Math.min(MAX_RAIL_X, (slotCentre - centre) / half),
      );

      const slot = slots[index];
      if (!slot) continue;
      if (Math.abs((railXRef.current[index] ?? Number.NaN) - x) < 0.002) {
        continue;
      }
      railXRef.current[index] = x;

      slot.style.setProperty(
        "--arc-lift",
        `${(ARC_DEPTH_PX * x * x).toFixed(1)}px`,
      );
      slot.style.setProperty("--bank", `${(-ARC_BANK_DEG * x).toFixed(2)}deg`);
      slot.style.setProperty(
        "--rail-scale",
        (1 - ARC_SCALE_FALLOFF * x * x).toFixed(4),
      );
    }

    if (nearest !== focusedIndex) onFocusIndex(nearest);
    nearestRef.current = nearest;
  }, [focusedIndex, items.length, onFocusIndex, slotAt]);

  const handleScroll = useCallback(() => {
    if (frameRef.current) return;
    frameRef.current = requestAnimationFrame(() => {
      frameRef.current = 0;
      updateRailGeometry();
    });

    // Settle-snap. CSS scroll snapping cannot do this job: it re-applies
    // synchronously to each programmatic scrollLeft write, so the wheel
    // handler below would advance the rail and be snapped straight back.
    window.clearTimeout(settleRef.current);
    settleRef.current = window.setTimeout(() => {
      const rail = railRef.current;
      const slot = slotAt(nearestRef.current);
      if (!rail || !slot) return;
      const target =
        slot.offsetLeft + slot.offsetWidth / 2 - rail.clientWidth / 2;
      if (Math.abs(rail.scrollLeft - target) < 1) return;
      centerOn(nearestRef.current);
    }, SETTLE_MS);
  }, [centerOn, slotAt, updateRailGeometry]);

  // Seat the focused card on first paint, before any scrolling happens.
  // Mount-only on purpose: later focus changes animate through centerOn, and
  // re-running this on every focusedIndex change would fight that animation.
  useEffect(() => {
    const rail = railRef.current;
    if (!rail) return;
    syncRailPadding();
    const slot = slotAt(focusedIndex);
    if (!slot) return;
    rail.scrollLeft =
      slot.offsetLeft + slot.offsetWidth / 2 - rail.clientWidth / 2;
    updateRailGeometry();
  }, []);

  useEffect(() => {
    const onResize = () => {
      syncRailPadding();
      handleScroll();
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [handleScroll, syncRailPadding]);

  useEffect(
    () => () => {
      if (frameRef.current) cancelAnimationFrame(frameRef.current);
      window.clearTimeout(settleRef.current);
    },
    [],
  );

  // React attaches wheel listeners passively, so mapping vertical wheel input
  // onto the rail needs a native non-passive listener.
  useEffect(() => {
    const rail = railRef.current;
    if (!rail) return;

    const onWheel = (event: WheelEvent) => {
      if (Math.abs(event.deltaY) <= Math.abs(event.deltaX)) return;

      const atStart = rail.scrollLeft <= 1;
      const atEnd = rail.scrollLeft + rail.clientWidth >= rail.scrollWidth - 1;
      if ((event.deltaY < 0 && atStart) || (event.deltaY > 0 && atEnd)) return;

      event.preventDefault();
      rail.scrollLeft += event.deltaY;
    };

    rail.addEventListener("wheel", onWheel, { passive: false });
    return () => rail.removeEventListener("wheel", onWheel);
  }, []);

  const moveTo = useCallback(
    (index: number) => {
      const next = Math.min(items.length - 1, Math.max(0, index));
      if (next === focusedIndex) return;
      onFocusIndex(next);
      centerOn(next);
      slotAt(next)?.querySelector("a")?.focus({ preventScroll: true });
    },
    [centerOn, focusedIndex, items.length, onFocusIndex, slotAt],
  );

  const handleKeyDown = (event: React.KeyboardEvent<HTMLUListElement>) => {
    if (event.key === "ArrowLeft") {
      event.preventDefault();
      moveTo(focusedIndex - 1);
    } else if (event.key === "ArrowRight") {
      event.preventDefault();
      moveTo(focusedIndex + 1);
    } else if (event.key === "Home") {
      event.preventDefault();
      moveTo(0);
    } else if (event.key === "End") {
      event.preventDefault();
      moveTo(items.length - 1);
    }
  };

  const handleFocus = (event: React.FocusEvent<HTMLUListElement>) => {
    const slot = (event.target as HTMLElement).closest<HTMLElement>(
      "[data-slot]",
    );
    if (!slot) return;
    const index = Number(slot.dataset.slot);
    if (Number.isNaN(index)) return;
    if (index !== focusedIndex) onFocusIndex(index);
    centerOn(index);
  };

  const handleSelect = (
    index: number,
    event: React.MouseEvent<HTMLAnchorElement>,
  ) => {
    // Off-centre cards take focus first; the centred card follows its link.
    if (index === focusedIndex) return;
    event.preventDefault();
    onFocusIndex(index);
    centerOn(index);
  };

  return (
    <div className="desk-rail-wrap">
      <ul
        className="desk-rail"
        ref={railRef}
        onScroll={handleScroll}
        onKeyDown={handleKeyDown}
        onFocus={handleFocus}
      >
        {items.map((item, index) => (
          <DeskCard
            key={item.href}
            item={item}
            index={index}
            lang={lang}
            focused={index === focusedIndex}
            focusDistance={Math.abs(index - focusedIndex)}
            onSelect={handleSelect}
          />
        ))}
      </ul>

      <div className="desk-rail-bottom">
        <div className="desk-rail-footer">
          <span className="desk-scroll-label">← {t("desk.scrollLeft")}</span>
          <span className="desk-rail-rule" aria-hidden="true" />
          <ol className="desk-dots">
            {items.map((item, index) => (
              <li key={item.href}>
                <button
                  type="button"
                  className="desk-dot"
                  data-active={index === focusedIndex ? "" : undefined}
                  aria-current={index === focusedIndex ? "true" : undefined}
                  aria-label={
                    item.kind === "article" ? item.title : t("nav.about")
                  }
                  onClick={() => {
                    onFocusIndex(index);
                    centerOn(index);
                  }}
                />
              </li>
            ))}
          </ol>
          <span className="desk-rail-rule" aria-hidden="true" />
          <span className="desk-scroll-label">{t("desk.scrollRight")} →</span>
        </div>

        <p className="desk-hint">{t("desk.clickToRead")}</p>
      </div>
    </div>
  );
}

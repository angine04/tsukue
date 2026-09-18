import { useCallback, useEffect, useRef } from "react";
import { useI18n } from "../../hooks/useI18n";
import type { DeskItem } from "../../lib/cards";
import DeskCard from "./DeskCard";

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

  // The focused card is whichever sits closest to the rail's centre, so
  // dragging, wheeling and the arrow keys all stay in agreement.
  const syncFromScroll = useCallback(() => {
    const rail = railRef.current;
    if (!rail) return;
    const centre = rail.scrollLeft + rail.clientWidth / 2;

    let nearest = focusedIndex;
    let closest = Number.POSITIVE_INFINITY;
    for (let index = 0; index < items.length; index += 1) {
      const slot = slotAt(index);
      if (!slot) continue;
      const distance = Math.abs(
        slot.offsetLeft + slot.offsetWidth / 2 - centre,
      );
      if (distance < closest) {
        closest = distance;
        nearest = index;
      }
    }

    if (nearest !== focusedIndex) onFocusIndex(nearest);
  }, [focusedIndex, items.length, onFocusIndex, slotAt]);

  const handleScroll = useCallback(() => {
    if (frameRef.current) return;
    frameRef.current = requestAnimationFrame(() => {
      frameRef.current = 0;
      syncFromScroll();
    });
  }, [syncFromScroll]);

  useEffect(
    () => () => {
      if (frameRef.current) cancelAnimationFrame(frameRef.current);
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
            onSelect={handleSelect}
          />
        ))}
      </ul>

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
    </div>
  );
}

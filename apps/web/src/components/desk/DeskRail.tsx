import { useCallback, useEffect, useRef } from "react";
import { useI18n } from "../../hooks/useI18n";
import type { DeskItem } from "../../lib/cards";
import DeskCard from "./DeskCard";

/**
 * The rail is laid out as a straight, scrollable row — that keeps native
 * scrolling and tab order intact — then each card is displaced onto a curve
 * per frame. A literal `offset-path` would bend the same way, but its
 * arc-length parameterisation cannot be derived from a layout position, so
 * cards would bunch towards the ends. A parabola from the card's normalised
 * distance is exact and costs one multiply.
 */
const ARC_DEPTH_PX = 30;
const ARC_BANK_DEG = 3;
const ARC_SCALE_FALLOFF = 0.04;
const MAX_RAIL_X = 1.5;

/**
 * Wheel input moves the rail by exactly the delta, synchronously, and nothing
 * moves it afterwards.
 *
 * Every attempt to also land it on a card has been worse than the problem. A
 * snap that runs after the gesture is a correction the eye catches. A snap that
 * runs continuously cannot work at all: snapping targets the *nearest* card, so
 * any input shorter than half a card is undone, and between two wheel notches
 * the nearest card is still the one being left — measured, five 90px notches
 * moved the rail nowhere and it finished where it started.
 *
 * So the rail follows the input and rests where the input leaves it. Landing on
 * a card is something you ask for — the keys, the dots, or clicking a card —
 * never something that happens to you.
 */
const WHEEL_LINE_PX = 16;

/** Explicit moves are deliberate, so they animate onto the card. */
const NAV_MS = 340;

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
  const navFrameRef = useRef(0);
  const railXRef = useRef<number[]>([]);

  // The wheel listener is attached once, so the state it needs is mirrored
  // into refs rather than re-attaching the listener on every focus change.
  const focusedIndexRef = useRef(focusedIndex);
  const navTargetRef = useRef<number | null>(null);
  const moveToRef = useRef<(index: number, duration?: number) => void>(
    () => {},
  );

  const slotAt = useCallback(
    (index: number) =>
      railRef.current?.querySelector<HTMLElement>(`[data-slot="${index}"]`) ??
      null,
    [],
  );

  /** Scroll offset that puts this card's centre on the rail's centre. */
  const targetFor = useCallback(
    (index: number) => {
      const rail = railRef.current;
      const slot = slotAt(index);
      if (!rail || !slot) return null;
      return slot.offsetLeft + slot.offsetWidth / 2 - rail.clientWidth / 2;
    },
    [slotAt],
  );

  /**
   * Hand-rolled rather than `scrollTo({ behavior: "smooth" })`: the native
   * curve is fixed and front-loaded, which reads as a lurch over one card's
   * travel, and it cannot be tuned. easeInOutCubic leaves and arrives gently.
   */
  const animateTo = useCallback((target: number, duration: number) => {
    const rail = railRef.current;
    if (!rail) return;
    if (navFrameRef.current) cancelAnimationFrame(navFrameRef.current);

    const start = rail.scrollLeft;
    const delta = target - start;
    if (Math.abs(delta) < 1) {
      navFrameRef.current = 0;
      return;
    }

    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      rail.scrollLeft = target;
      navFrameRef.current = 0;
      return;
    }

    const began = performance.now();
    const step = (now: number) => {
      const progress = Math.min(1, (now - began) / duration);
      const eased =
        progress < 0.5 ? 4 * progress ** 3 : 1 - (-2 * progress + 2) ** 3 / 2;
      rail.scrollLeft = start + delta * eased;
      navFrameRef.current = progress < 1 ? requestAnimationFrame(step) : 0;
    };
    navFrameRef.current = requestAnimationFrame(step);
  }, []);

  const centerOn = useCallback(
    (index: number, duration = NAV_MS) => {
      const target = targetFor(index);
      if (target === null) return;
      animateTo(target, duration);
    },
    [animateTo, targetFor],
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
   * One pass over the cards derives each card's place on the curve, and which
   * card the rail is currently sitting on. Frames only write CSS custom
   * properties, so scrolling never re-renders React except when the focused
   * card actually changes.
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

    // While a move is animating, the position still belongs to the card being
    // left, so deriving focus from it would revert to the old card and cancel
    // the move's own intent. The move is authoritative until it lands.
    if (!navFrameRef.current && nearest !== focusedIndex) {
      focusedIndexRef.current = nearest;
      onFocusIndex(nearest);
    }
  }, [focusedIndex, items.length, onFocusIndex, slotAt]);

  const handleScroll = useCallback(() => {
    if (frameRef.current) return;
    frameRef.current = requestAnimationFrame(() => {
      frameRef.current = 0;
      updateRailGeometry();
    });
  }, [updateRailGeometry]);

  const moveTo = useCallback(
    (index: number, duration = NAV_MS) => {
      const next = Math.min(items.length - 1, Math.max(0, index));
      // Compared against the ref, not the render's prop, so several requests
      // inside one frame each still advance.
      if (next === focusedIndexRef.current) return;
      focusedIndexRef.current = next;
      navTargetRef.current = next;
      onFocusIndex(next);
      centerOn(next, duration);
      slotAt(next)?.querySelector("a")?.focus({ preventScroll: true });
    },
    [centerOn, items.length, slotAt],
  );

  useEffect(() => {
    moveToRef.current = moveTo;
  }, [moveTo]);

  // Seat the focused card on first paint, before any scrolling happens.
  // Mount-only on purpose: later focus changes animate through centerOn, and
  // re-running this on every focusedIndex change would fight that animation.
  useEffect(() => {
    const rail = railRef.current;
    if (!rail) return;
    syncRailPadding();
    const target = targetFor(focusedIndex);
    if (target === null) return;
    rail.scrollLeft = target;
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
      if (navFrameRef.current) cancelAnimationFrame(navFrameRef.current);
    },
    [],
  );

  // React attaches wheel listeners passively, so consuming wheel input needs a
  // native non-passive listener.
  useEffect(() => {
    const rail = railRef.current;
    if (!rail) return;

    const onWheel = (event: WheelEvent) => {
      const unit =
        event.deltaMode === 1
          ? WHEEL_LINE_PX
          : event.deltaMode === 2
            ? rail.clientHeight
            : 1;
      const dominant =
        Math.abs(event.deltaY) >= Math.abs(event.deltaX)
          ? event.deltaY
          : event.deltaX;
      const delta = dominant * unit;
      if (delta === 0) return;

      const atStart = rail.scrollLeft <= 1;
      const atEnd = rail.scrollLeft + rail.clientWidth >= rail.scrollWidth - 1;
      if ((delta < 0 && atStart) || (delta > 0 && atEnd)) {
        // Nowhere left to go: release the gesture so the page can scroll.
        return;
      }

      // Anything already animating would fight the hand, so it yields first.
      if (navFrameRef.current) {
        cancelAnimationFrame(navFrameRef.current);
        navFrameRef.current = 0;
      }

      event.preventDefault();
      rail.scrollLeft += delta;
    };

    rail.addEventListener("wheel", onWheel, { passive: false });
    return () => rail.removeEventListener("wheel", onWheel);
  }, []);

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
    // A move focuses its own destination; that is not a new request to honour.
    if (navFrameRef.current && index === navTargetRef.current) return;
    if (index !== focusedIndexRef.current) {
      focusedIndexRef.current = index;
      onFocusIndex(index);
    }
    centerOn(index);
  };

  const handleSelect = (
    index: number,
    event: React.MouseEvent<HTMLAnchorElement>,
  ) => {
    const rail = railRef.current;
    const target = targetFor(index);

    // Clicking anything that is not already centred brings it to the centre;
    // only the centred card follows its link. Deciding this from the actual
    // offset rather than from `focusedIndex` matters now that scrolling is
    // free: the focused card is merely the nearest one, so it is usually a
    // little off centre and would otherwise navigate on the first click.
    if (rail && target !== null && Math.abs(rail.scrollLeft - target) > 1) {
      event.preventDefault();
      focusedIndexRef.current = index;
      navTargetRef.current = index;
      onFocusIndex(index);
      centerOn(index);
    }
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
                  onClick={() => moveTo(index)}
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

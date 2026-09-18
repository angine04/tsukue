import { memo, useCallback, useEffect, useRef } from "react";
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
 *
 * Scrolling is the hot path, so the per-frame work is kept to the minimum:
 * card geometry is measured once and cached rather than read back every frame,
 * and each card receives a single custom property, with the arc, bank and
 * scale derived from it in CSS. Writing three properties instead tripled the
 * style invalidation for no gain.
 */
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

function DeskRail({ items, lang, focusedIndex, onFocusIndex }: DeskRailProps) {
  const { t } = useI18n(lang);
  const railRef = useRef<HTMLUListElement>(null);
  const frameRef = useRef(0);
  const navFrameRef = useRef(0);

  /** Measured once per layout change; scrolling never changes these. */
  const slotsRef = useRef<(HTMLElement | null)[]>([]);
  const centresRef = useRef<number[]>([]);
  const halfRef = useRef(480);
  const railXRef = useRef<number[]>([]);
  const lastScrollRef = useRef(0);
  const zFocusRef = useRef(-1);

  // The wheel listener is attached once, so the state it needs is mirrored
  // into refs rather than re-attaching the listener on every focus change.
  const focusedIndexRef = useRef(focusedIndex);
  const navTargetRef = useRef<number | null>(null);

  const targetFor = useCallback((index: number) => {
    const rail = railRef.current;
    const centre = centresRef.current[index];
    if (!rail || centre === undefined) return null;
    return centre - rail.clientWidth / 2;
  }, []);

  /**
   * Read every card box once and keep it. These are layout positions in the
   * rail's content space, so they are invariant under scrolling — re-reading
   * them per frame forced a style flush for nothing.
   */
  const measure = useCallback(() => {
    const rail = railRef.current;
    if (!rail) return;
    const slots: (HTMLElement | null)[] = [];
    const centres: number[] = [];
    for (let index = 0; index < items.length; index += 1) {
      const slot =
        rail.querySelector<HTMLElement>(`[data-slot="${index}"]`) ?? null;
      slots.push(slot);
      centres.push(slot ? slot.offsetLeft + slot.offsetWidth / 2 : Number.NaN);
    }
    slotsRef.current = slots;
    centresRef.current = centres;
    halfRef.current = rail.clientWidth / 2 || 1;
    railXRef.current = [];
  }, [items.length]);

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
      rail.querySelector<HTMLElement>(`[data-slot="${index}"] .desk-card`)
        ?.offsetWidth;
    const first = cardWidth(0);
    const last = cardWidth(items.length - 1);
    if (first) {
      rail.style.setProperty("--rail-edge-start", `${first}px`);
    }
    if (last) {
      rail.style.setProperty("--rail-edge-end", `${last}px`);
    }
  }, [items.length]);

  /** Re-measure after anything that can change the layout. */
  const remeasure = useCallback(() => {
    syncRailPadding();
    measure();
    // Padding changed, so the centre position may have shifted. The next
    // updateRailGeometry call will recompute nearest and update z-index.
  }, [measure, syncRailPadding]);

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
   * One pass per frame, writing a single custom property per card. The arc,
   * bank and scale all come off that one value in CSS.
   */
  /**
   * One pass per frame, writing a single custom property per card. The arc,
   * bank and scale all come off that one value in CSS.
   */
  const updateRailGeometry = useCallback(() => {
    const rail = railRef.current;
    if (!rail) return;

    const centre = rail.scrollLeft + rail.clientWidth / 2;
    const half = halfRef.current;
    const centres = centresRef.current;
    const slots = slotsRef.current;
    const cached = railXRef.current;

    // Detect scroll momentum: if scrollLeft changed between frames, the user's
    // wheel gesture or the browser's inertial scroll is still running. Defer
    // z-index updates until it settles to avoid mid-scroll pop.
    const scrolling = Math.abs(rail.scrollLeft - lastScrollRef.current) > 0.5;
    lastScrollRef.current = rail.scrollLeft;

    let nearest = 0;
    let closest = Number.POSITIVE_INFINITY;

    for (let index = 0; index < centres.length; index += 1) {
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

      if (Math.abs((cached[index] ?? Number.NaN) - x) < 0.002) continue;
      cached[index] = x;
      slots[index]?.style.setProperty("--rail-x", x.toFixed(4));
    }

    // Depth order only changes when the focus does, so it is not part of the
    // per-frame work. Crucially, z-index updates are deferred while an explicit
    // move is animating OR while scrolling momentum is active: updating z-index
    // mid-scroll causes visual glitches where a card with old overlap but new
    // z-index suddenly pops above/below neighbors. Wait until the animation
    // settles so position and z-order agree.
    if (nearest !== zFocusRef.current && !navFrameRef.current && !scrolling) {
      zFocusRef.current = nearest;
      for (let index = 0; index < slots.length; index += 1) {
        slots[index]?.style.setProperty(
          "z-index",
          String(100 - Math.abs(index - nearest)),
        );
      }
    }

    // While a move is animating, the position still belongs to the card being
    // left, so deriving focus from it would revert to the old card and cancel
    // the move's own intent. The move is authoritative until it lands.
    if (!navFrameRef.current && nearest !== focusedIndex) {
      focusedIndexRef.current = nearest;
      onFocusIndex(nearest);
    }
  }, [focusedIndex, onFocusIndex]);

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
      slotsRef.current[next]
        ?.querySelector("a")
        ?.focus({ preventScroll: true });
    },
    [centerOn, items.length, onFocusIndex],
  );

  // Seat the focused card on first paint, before any scrolling happens.
  // Mount-only on purpose: later focus changes animate through centerOn, and
  // re-running this on every focusedIndex change would fight that animation.
  useEffect(() => {
    const rail = railRef.current;
    if (!rail) return;
    remeasure();
    const target = targetFor(focusedIndex);
    if (target === null) return;
    rail.scrollLeft = target;
    updateRailGeometry();
  }, []);

  useEffect(() => {
    const onResize = () => {
      remeasure();
      // Card widths are viewport-relative, so a resize moves every card under
      // a stationary scroll offset and the focused card drifts off centre.
      // Put it back without animating: the layout changed, not the selection.
      const rail = railRef.current;
      const target = targetFor(focusedIndexRef.current);
      if (rail && target !== null) rail.scrollLeft = target;
      handleScroll();
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [handleScroll, remeasure, targetFor]);

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

      // Cheap boundary test against cached geometry, so a gesture at either end
      // costs nothing and can fall through to scroll the page.
      const maxScroll = Math.max(
        0,
        (centresRef.current[centresRef.current.length - 1] ?? 0) +
          halfRef.current -
          rail.clientWidth,
      );
      const atStart = rail.scrollLeft <= 1;
      const atEnd = rail.scrollLeft >= maxScroll - 1;
      if ((delta < 0 && atStart) || (delta > 0 && atEnd)) return;

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

  const handleSelect = useCallback(
    (index: number, event: React.MouseEvent<HTMLAnchorElement>) => {
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
    },
    [centerOn, onFocusIndex, targetFor],
  );

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

export default memo(DeskRail);

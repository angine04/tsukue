import { motion } from "framer-motion";
import { useEffect, useRef } from "react";

interface SheetProps {
  /**
   * Trusted build-time HTML: a post's rendered MDX, or this site's own About
   * sheet. Never user input.
   */
  html: string;
  /** Accessible name for the dialog — the article's title, or "About". */
  label: string;
  /** Label for the control that dismisses the sheet. */
  backLabel: string;
  /**
   * Shared-layout identity, so the sheet appears to be the card that opened
   * it. Omitted when there is no such card: the About sheet is reached by
   * navigating, and nothing on the desk morphs into it.
   */
  layoutId?: string;
  /**
   * Presented rather than animated. Set for a sheet a URL asked for, where
   * there was no click to answer: morphing out of a card on page load draws
   * attention to an interaction the reader never made, and the sheet has to
   * appear identical to the server-rendered one it replaces.
   */
  instant?: boolean;
  /**
   * Rendered after the injected article — the comments, which belong to the
   * article but are not part of it. Absent for the About sheet.
   */
  children?: React.ReactNode;
  onClose: () => void;
}

/**
 * A sheet of paper lifted off the desk: the article a card expands into, and
 * the About page. One component because they are one surface — the overlay,
 * the paper, the scroll lock and the focus handling are the same in both, and
 * second copies of them would drift apart.
 *
 * When it is the card's own box, the shared `layoutId` reveals it from there,
 * so no scale is applied here — a scale on top of the layout projection is
 * applied twice and reads as a bounce at the edges.
 */
export default function Sheet({
  html,
  label,
  backLabel,
  layoutId,
  instant = false,
  children,
  onClose,
}: SheetProps) {
  const contentRef = useRef<HTMLDivElement>(null);
  const backRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!contentRef.current) return;
    contentRef.current.innerHTML = html;
  }, [html]);

  // Scroll lock and focus return are the sheet's own business: the desk behind
  // it must not scroll, and a keyboard user who opened the sheet should land on
  // its first control rather than back at the top of the page.
  //
  // Taking focus is skipped for a sheet the reader did not open. Answering a
  // load by moving focus draws a focus ring on a control nobody touched — the
  // browser reads programmatic focus after a load as keyboard-driven — and
  // that ring is the visible difference between landing on a sheet and opening
  // it.
  useEffect(() => {
    const previouslyFocused = document.activeElement as HTMLElement | null;
    const { overflow } = document.body.style;
    document.body.style.overflow = "hidden";

    if (!instant) backRef.current?.focus({ preventScroll: true });

    return () => {
      document.body.style.overflow = overflow;
      if (!instant) previouslyFocused?.focus?.({ preventScroll: true });
    };
  }, [instant]);

  return (
    <motion.div
      className="article-sheet-overlay"
      initial={instant ? false : { opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={instant ? undefined : { opacity: 0 }}
      transition={{ duration: 0.2 }}
      onClick={onClose}
    >
      <motion.article
        layoutId={instant ? undefined : layoutId}
        className="sheet-surface article-sheet"
        role="dialog"
        aria-modal="true"
        aria-label={label}
        onClick={(event) => event.stopPropagation()}
      >
        <button
          ref={backRef}
          type="button"
          className="sheet-back"
          onClick={onClose}
        >
          ← {backLabel}
        </button>
        <div ref={contentRef} className="sheet-body" />
        {children}
      </motion.article>
    </motion.div>
  );
}

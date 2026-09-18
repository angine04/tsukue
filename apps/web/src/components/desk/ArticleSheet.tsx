import { motion } from "framer-motion";
import { useEffect, useRef } from "react";
import { useI18n } from "../../hooks/useI18n";

interface ArticleSheetProps {
  html: string;
  lang: string;
  onClose: () => void;
}

export default function ArticleSheet({
  html,
  lang,
  onClose,
}: ArticleSheetProps) {
  const { t } = useI18n(lang);
  const contentRef = useRef<HTMLDivElement>(null);

  // Inject the fetched HTML
  useEffect(() => {
    if (contentRef.current) {
      contentRef.current.innerHTML = html;
    }
  }, [html]);

  return (
    <motion.div
      className="article-sheet-overlay"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
      onClick={onClose}
    >
      <motion.div
        className="article-sheet"
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.9, opacity: 0 }}
        transition={{ type: "spring", stiffness: 300, damping: 30 }}
        onClick={(e) => e.stopPropagation()}
      >
        <button
          className="article-sheet-close"
          onClick={onClose}
          aria-label={t("common.close")}
        >
          ×
        </button>
        <div ref={contentRef} className="article-sheet-content" />
      </motion.div>
    </motion.div>
  );
}

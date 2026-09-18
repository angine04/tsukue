import { MotionConfig } from "framer-motion";
import { useState } from "react";
import type { DeskItem } from "../../lib/cards";
import DeskHeader from "./DeskHeader";
import DeskRail from "./DeskRail";

interface DeskAppProps {
  items: DeskItem[];
  lang?: string;
}

export default function DeskApp({ items, lang = "en" }: DeskAppProps) {
  const [focusedIndex, setFocusedIndex] = useState(0);

  return (
    <MotionConfig reducedMotion="user">
      <div className="desk desk-app">
        <DeskHeader lang={lang} />
        <DeskRail
          items={items}
          lang={lang}
          focusedIndex={focusedIndex}
          onFocusIndex={setFocusedIndex}
        />
      </div>
    </MotionConfig>
  );
}

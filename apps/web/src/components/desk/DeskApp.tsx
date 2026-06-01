import { useState } from "react";
import { useI18n } from "../../hooks/useI18n";

interface DeskAppProps {
  lang?: string;
}

export default function DeskApp({ lang = "en" }: DeskAppProps) {
  const { t } = useI18n(lang);
  const [mode, setMode] = useState<"desk" | "article" | "about">("desk");

  return (
    <div className="desk min-h-screen">
      <div className="container mx-auto px-4 py-8">
        <h1 className="font-serif text-4xl text-[var(--color-paper-ivory)] mb-8">
          {t("nav.home")}
        </h1>
        <p className="text-[var(--color-paper-sand)]">
          Mode: {mode}
        </p>
      </div>
    </div>
  );
}

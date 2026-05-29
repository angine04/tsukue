import { useState } from "react";

export default function DeskApp() {
  const [mode, setMode] = useState<"desk" | "article" | "about">("desk");

  return (
    <div className="desk min-h-screen">
      <div className="container mx-auto px-4 py-8">
        <h1 className="font-serif text-4xl text-[var(--color-paper-ivory)] mb-8">
          Desk App Placeholder
        </h1>
        <p className="text-[var(--color-paper-sand)]">
          Mode: {mode}
        </p>
      </div>
    </div>
  );
}

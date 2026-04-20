"use client";

import { useEffect, useState } from "react";

export function ThemeToggle() {
  const [isDark, setIsDark] = useState(() => {
    if (typeof window === "undefined") return true;
    const stored = window.localStorage.getItem("ahackaday-theme");
    return stored ? stored === "dark" : true;
  });

  function toggleTheme() {
    const nextDark = !isDark;
    setIsDark(nextDark);
  }

  useEffect(() => {
    const root = document.documentElement;
    root.dataset.theme = isDark ? "dark" : "light";
    window.localStorage.setItem("ahackaday-theme", isDark ? "dark" : "light");
  }, [isDark]);

  return (
    <button
      type="button"
      onClick={toggleTheme}
      className="micro-lift glow-focus rounded-md border border-zinc-700 bg-zinc-900/60 px-2 py-1 text-xs uppercase tracking-wide text-zinc-300 hover:border-zinc-500 hover:text-zinc-100"
      aria-label="Toggle dark mode"
    >
      {isDark ? "Dark" : "Light"}
    </button>
  );
}

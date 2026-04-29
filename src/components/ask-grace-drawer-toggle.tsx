"use client";

import { useState } from "react";

import { graceAvatarUrl } from "@/lib/ecosystem";

type AskGraceDrawerToggleProps = {
  containerId: string;
  className?: string;
};

export function AskGraceDrawerToggle({ containerId, className = "" }: AskGraceDrawerToggleProps) {
  const [open, setOpen] = useState(false);

  function onToggle() {
    const next = !open;
    setOpen(next);
    const root = document.getElementById(containerId);
    if (!root) return;
    root.classList.toggle("is-ask-open", next);
  }

  return (
    <button
      type="button"
      className={["open-in-grace", "open-in-grace--toggle", className].filter(Boolean).join(" ")}
      aria-label={open ? "Hide Ask Grace AI" : "Show Ask Grace AI"}
      aria-expanded={open}
      onClick={onToggle}
    >
      <img className="open-in-grace__icon" src={graceAvatarUrl()} alt="" width={22} height={22} decoding="async" />
    </button>
  );
}

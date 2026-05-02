"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";

import { getToolkitLinkRows } from "@/lib/ecosystem";

export function ToolkitDrawer() {
  const [open, setOpen] = useState(false);
  const closeBtnRef = useRef<HTMLButtonElement>(null);
  const launchRef = useRef<HTMLButtonElement>(null);
  const wasOpen = useRef(false);
  const panelId = useId();

  const onClose = useCallback(() => {
    setOpen(false);
  }, []);

  const onOpen = useCallback(() => {
    setOpen(true);
  }, []);

  useEffect(() => {
    if (open) {
      wasOpen.current = true;
      const t = setTimeout(() => closeBtnRef.current?.focus(), 0);
      return () => clearTimeout(t);
    }
    if (wasOpen.current) {
      wasOpen.current = false;
      const t = setTimeout(() => launchRef.current?.focus(), 0);
      return () => clearTimeout(t);
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  const rows = getToolkitLinkRows();

  return (
    <>
      <button
        ref={launchRef}
        type="button"
        className="toolkit-launch toolkit-launch--icon"
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        aria-label="Open toolkit"
        title="Toolkit"
        onClick={onOpen}
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden>
          <circle cx="12" cy="12" r="3" />
          <path
            d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"
            strokeLinecap="round"
          />
        </svg>
      </button>
      {open && (
        <div className="toolkit-dock" role="presentation">
          <button
            type="button"
            className="toolkit-dock__backdrop"
            aria-label="Close toolkit"
            onClick={onClose}
          />
          <div
            id={panelId}
            className="toolkit-panel"
            role="dialog"
            aria-modal="true"
            aria-labelledby={`${panelId}-title`}
          >
            <div className="toolkit-panel__head">
              <h2 id={`${panelId}-title`} className="toolkit-panel__title">
                Cantina toolkit
              </h2>
              <button
                ref={closeBtnRef}
                type="button"
                className="toolkit-panel__close"
                onClick={onClose}
                aria-label="Close"
              >
                ×
              </button>
            </div>
            <div className="toolkit-panel__body">
              <p className="toolkit-panel__intro">
                Teams can use the markdown link below for the Slack integration. Other toolkit items are marked as
                coming soon.
              </p>
              <ul className="toolkit-list">
                {rows.map((row) => {
                  if (row.comingSoon) {
                    return (
                      <li key={row.label} className="toolkit-list__row toolkit-list__row--soon">
                        <span className="toolkit-list__label">{row.label}</span>
                        <span className="toolkit-list__missing">coming soon</span>
                      </li>
                    );
                  }

                  if (row.missing) {
                    return (
                      <li key={row.label} className="toolkit-list__row">
                        <span className="toolkit-list__label">{row.label}</span>
                        <span
                          className="toolkit-list__missing"
                          title="Set NEXT_PUBLIC_GRACE_ORIGIN for production, or in .env.local for dev"
                        >
                          (configure origin)
                        </span>
                      </li>
                    );
                  }
                  return (
                    <li key={row.label} className="toolkit-list__row">
                      <a
                        className="toolkit-list__link"
                        href={row.href}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={onClose}
                      >
                        {row.markdownLabel ?? row.label}
                      </a>
                    </li>
                  );
                })}
              </ul>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

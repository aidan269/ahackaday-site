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
        className="toolkit-launch"
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        onClick={onOpen}
      >
        Toolkit
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
                Teams can use the markdown link below to implement the Grace Slack integration. Other toolkit items are
                staged and marked as coming soon.
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

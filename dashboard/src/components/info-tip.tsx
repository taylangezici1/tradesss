"use client";

import { Info } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { GLOSSARY, type GlossaryTerm } from "@/lib/glossary";

interface Props {
  term: GlossaryTerm;
  size?: "xs" | "sm";
  className?: string;
}

/**
 * Small info icon with a hover/focus tooltip explaining a financial term.
 * The tooltip is rendered via React portal at the document body, so it
 * escapes parent overflow (works inside tables, modals, etc.).
 */
export function InfoTip({ term, size = "xs", className }: Props) {
  const def = GLOSSARY[term];
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [show, setShow] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const updatePos = () => {
    const el = triggerRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    // Position below the icon, anchored at the icon's horizontal centre.
    const top = r.bottom + 6;
    const left = r.left + r.width / 2;
    setPos({ top, left });
  };

  useEffect(() => {
    if (!show) {
      setPos(null);
      return;
    }
    updatePos();
    const onScroll = () => updatePos();
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", onScroll);
    };
  }, [show]);

  if (!def) return null;
  const iconSize = size === "sm" ? "h-3.5 w-3.5" : "h-3 w-3";

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onMouseEnter={() => setShow(true)}
        onMouseLeave={() => setShow(false)}
        onFocus={() => setShow(true)}
        onBlur={() => setShow(false)}
        onClick={(e) => {
          // Don't propagate to parent (e.g. sortable th)
          e.stopPropagation();
        }}
        aria-label={`What is ${def.title}?`}
        className={`inline-flex shrink-0 items-center justify-center text-ink-dim transition-colors hover:text-signal-accent focus:text-signal-accent focus:outline-none ${className ?? ""}`}
      >
        <Info className={iconSize} />
      </button>

      {mounted &&
        show &&
        pos &&
        createPortal(
          <div
            role="tooltip"
            style={{ top: pos.top, left: pos.left }}
            className="pointer-events-none fixed z-[100] w-72 max-w-[calc(100vw-32px)] -translate-x-1/2 rounded-md border border-edge bg-bg-elev2 px-3 py-2 text-xs shadow-2xl"
          >
            <div className="text-[13px] font-semibold normal-case tracking-normal text-ink">
              {def.title}
            </div>
            <div className="mt-1 normal-case font-normal leading-relaxed tracking-normal text-ink-dim">
              {def.definition}
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}

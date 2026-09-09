"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

/**
 * The one motion primitive for the whole landing page: fade up 16px, once,
 * the first time an element is at least 15% into the viewport. An element
 * already on screen at load (the hero) fires immediately — an
 * IntersectionObserver reports "intersecting" on its very first callback
 * regardless of whether that is because the page just loaded or because the
 * visitor just scrolled there, so one component covers both.
 *
 * Duration and easing are set here once rather than per call site, so every
 * section arrives at the same speed. `prefers-reduced-motion` needs no
 * special case: the blanket rule in globals.css already collapses every
 * transition to 0.01ms, so this becomes an instant, un-animated appearance.
 */
export function Reveal({
  children,
  delay = 0,
  className,
}: {
  children: React.ReactNode;
  /** Stagger, in ms, for a row of siblings revealing in sequence. */
  delay?: number;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true);
          io.disconnect();
        }
      },
      { threshold: 0.15 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      style={{ transitionDelay: `${delay}ms` }}
      className={cn(
        "transition-[opacity,transform] duration-700 ease-out",
        visible ? "translate-y-0 opacity-100" : "translate-y-4 opacity-0",
        className,
      )}
    >
      {children}
    </div>
  );
}

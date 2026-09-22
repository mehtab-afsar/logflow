"use client";

import { useEffect, useState } from "react";

const WORDS = ["LR book", "POD", "freight bill"] as const;

/**
 * The three documents the headline promises, taking turns in the same slot.
 * A vertical flip rather than Moonbook's type/delete — this is a rotation
 * through a fixed, known list (there are exactly three), not an open-ended
 * typing effect, so the mechanic should say "cycling a set" rather than
 * "composing a sentence".
 *
 * `prefers-reduced-motion` needs no special case here: the blanket rule in
 * globals.css already collapses the animation to 0.01ms, so this becomes an
 * instant word-swap. The full phrase is duplicated into an sr-only span so a
 * screen reader gets one sentence, not three words read as they cycle.
 */
export function FlipWord() {
  const [i, setI] = useState(0);

  useEffect(() => {
    const id = setInterval(() => setI((n) => (n + 1) % WORDS.length), 2400);
    return () => clearInterval(id);
  }, []);

  return (
    <>
      <span className="relative inline-block h-[1.1em] overflow-hidden align-bottom">
        {/* select-none: this is the visual-only copy. Selecting/copying the headline
            should pick up the stable sr-only phrase below, not this plus one cycling
            word glued together. */}
        <span
          key={i}
          aria-hidden
          className="animate-flip-word pointer-events-none inline-block text-indigo-ink select-none"
        >
          {WORDS[i]}
        </span>
      </span>
      <span className="sr-only">LR book, POD and freight bill</span>
    </>
  );
}

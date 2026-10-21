"use client";

import { useLayoutEffect, useRef } from "react";

// For a bubble centred over something with `translateX(calc(-50% + var(--edge-shift)))`:
// measures it after it renders and sets --edge-shift so it stays `margin` px inside the screen.
// Children can undo the shift (e.g. an arrow with `calc(-50% - var(--edge-shift))`) to keep pointing at the target.
export function useKeepInViewport<T extends HTMLElement>(margin = 8) {
  const ref = useRef<T>(null);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.setProperty("--edge-shift", "0px");
    const rect = el.getBoundingClientRect();
    const viewport = document.documentElement.clientWidth;
    let shift = 0;
    if (rect.right > viewport - margin) shift = viewport - margin - rect.right;
    if (rect.left + shift < margin) shift = margin - rect.left;
    el.style.setProperty("--edge-shift", `${shift}px`);
  });

  return ref;
}

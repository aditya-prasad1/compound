"use client";

import { useEffect, useState } from "react";

export type ThemeMode = "light" | "dark" | "system";

const STORAGE_KEY = "compound-theme";

function getSystemTheme(): "light" | "dark" {
  if (typeof window === "undefined") return "light";
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

export function resolveEffectiveTheme(mode: ThemeMode): "light" | "dark" {
  if (mode === "system") {
    return getSystemTheme();
  }
  return mode;
}

export function applyTheme(mode: ThemeMode) {
  const effective = resolveEffectiveTheme(mode);
  if (typeof document !== "undefined") {
    document.documentElement.setAttribute("data-theme", effective);
  }
}

export function useTheme() {
  const [mounted, setMounted] = useState(false);
  const [mode, setMode] = useState<ThemeMode>("system");

  // Read saved preference on mount and apply it
  useEffect(() => {
    setMounted(true);
    const saved = localStorage.getItem(STORAGE_KEY) as ThemeMode | null;
    const initialMode = saved === "light" || saved === "dark" ? saved : "system";
    setMode(initialMode);
    applyTheme(initialMode);

    // Listen for system preference changes when in "system" mode
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const handler = () => {
      const current = localStorage.getItem(STORAGE_KEY) as ThemeMode | null;
      if (!current || current === "system") {
        applyTheme("system");
        setMode((prev) => (prev === "system" ? "system" : prev));
      }
    };
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

  function toggleTheme() {
    setMode((prev) => {
      // Determine what is currently active and flip directly to the other
      const currentEffective = resolveEffectiveTheme(prev);
      const next: ThemeMode = currentEffective === "dark" ? "light" : "dark";
      localStorage.setItem(STORAGE_KEY, next);
      applyTheme(next);
      return next;
    });
  }

  // During SSR and initial client hydration (before mount), provide a stable default
  // so the server-rendered HTML matches the initial client virtual DOM exactly.
  const effective = mounted ? resolveEffectiveTheme(mode) : "light";

  return { mode, effective, mounted, cycleTheme: toggleTheme, toggleTheme };
}

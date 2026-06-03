"use client";

import { Moon, Sun } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "./ui/button";

type Theme = "light" | "dark";

function getInitialTheme(): Theme {
  if (typeof window === "undefined") return "light";
  const savedTheme = window.localStorage.getItem("psm-theme");
  if (savedTheme === "dark" || savedTheme === "light") return savedTheme;
  return window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}

export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>("light");

  useEffect(() => {
    const initialTheme = getInitialTheme();
    setTheme(initialTheme);
    document.documentElement.dataset.theme = initialTheme;
  }, []);

  function toggleTheme() {
    const nextTheme = theme === "dark" ? "light" : "dark";
    setTheme(nextTheme);
    document.documentElement.dataset.theme = nextTheme;
    window.localStorage.setItem("psm-theme", nextTheme);
  }

  return (
    <Button
      aria-label="Toggle dark mode"
      className="theme-toggle"
      onClick={toggleTheme}
      size="sm"
      type="button"
      variant="ghost"
    >
      {theme === "dark" ? (
        <Sun aria-hidden="true" size={14} strokeWidth={1.75} />
      ) : (
        <Moon aria-hidden="true" size={14} strokeWidth={1.75} />
      )}
      <span aria-hidden="true">{theme === "dark" ? "Light" : "Dark"}</span>
    </Button>
  );
}

"use client";

type Theme = "light" | "dark";

// Current applied theme: explicit data-theme wins, else the OS preference.
function currentTheme(): Theme {
  const ds = document.documentElement.dataset.theme;
  if (ds === "light" || ds === "dark") return ds;
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

// Toggle light/dark. Writes data-theme on <html> (CSS reads it) + persists it.
// The button label is driven entirely by CSS (.to-light / .to-dark) so it always
// matches the applied theme with no React state and no hydration mismatch.
export default function ThemeToggle() {
  function toggle() {
    const next: Theme = currentTheme() === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = next;
    try {
      localStorage.setItem("theme", next);
    } catch {
      // ignore: storage may be unavailable (private mode)
    }
  }

  return (
    <button
      className="theme-toggle"
      onClick={toggle}
      aria-label="Toggle light/dark theme"
      title="Toggle theme"
      style={{
        position: "fixed",
        top: 16,
        right: 16,
        zIndex: 50,
        font: "inherit",
        fontSize: 13,
        fontWeight: 600,
        padding: "8px 12px",
        borderRadius: 999,
        border: "1px solid var(--border)",
        background: "var(--surface)",
        color: "var(--text)",
        cursor: "pointer",
      }}
    >
      <span className="to-dark">🌙 Dark</span>
      <span className="to-light">☀ Light</span>
    </button>
  );
}

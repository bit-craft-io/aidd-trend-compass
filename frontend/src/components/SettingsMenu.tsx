import { useEffect, useRef, useState } from "react";
import { useTheme, type ThemeChoice } from "../theme/ThemeContext";

const OPTIONS: { key: ThemeChoice; label: string }[] = [
  { key: "light", label: "ライト" },
  { key: "dark", label: "ダーク" },
  { key: "system", label: "システムに合わせる" },
];

export function SettingsMenu() {
  const { themeChoice, setThemeChoice } = useTheme();
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;

    const handlePointerDown = (event: PointerEvent) => {
      if (!containerRef.current) return;
      if (!containerRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
      }
    };

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  return (
    <div className="settings-menu" ref={containerRef}>
      <button
        type="button"
        aria-label="表示設定を開く"
        aria-expanded={open}
        className="settings-menu-trigger"
        onClick={() => setOpen((prev) => !prev)}
      >
        <svg
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <circle cx="12" cy="12" r="3"></circle>
          <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"></path>
        </svg>
      </button>
      {open && (
        <div className="settings-menu-panel" role="menu">
          <div className="settings-menu-title">表示設定</div>
          <div className="settings-menu-options">
            {OPTIONS.map((opt) => {
              const selected = themeChoice === opt.key;
              return (
                <button
                  key={opt.key}
                  type="button"
                  role="menuitemradio"
                  aria-checked={selected}
                  className={
                    selected
                      ? "settings-menu-option settings-menu-option-selected"
                      : "settings-menu-option"
                  }
                  onClick={() => {
                    setThemeChoice(opt.key);
                    setOpen(false);
                  }}
                >
                  <span className="settings-menu-dot"></span>
                  <span>{opt.label}</span>
                </button>
              );
            })}
          </div>
          <div className="settings-menu-note">選択内容はこのブラウザに保存されます</div>
        </div>
      )}
    </div>
  );
}

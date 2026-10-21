'use client';
import { useEffect, useState } from 'react';
import { Moon, Sun } from 'lucide-react';
export function ThemeSelector() {
  const [dark, setDark] = useState(false);
  useEffect(() => {
    const system = window.matchMedia('(prefers-color-scheme: dark)');
    const sync = () => {
      const current = document.documentElement.dataset.theme;
      setDark(current === 'dark' || (current !== 'light' && system.matches));
    };
    const storage = (event: StorageEvent) => {
      if (event.key !== 'ordo.theme' && event.key !== null) return;
      const value = event.newValue;
      document.documentElement.dataset.theme =
        value === 'light' || value === 'dark' ? value : 'system';
      sync();
    };
    sync();
    system.addEventListener('change', sync);
    window.addEventListener('storage', storage);
    return () => {
      system.removeEventListener('change', sync);
      window.removeEventListener('storage', storage);
    };
  }, []);
  const label = dark ? 'Switch to light mode' : 'Switch to dark mode';
  return (
    <button
      type="button"
      className="icon-button theme-selector"
      aria-label={label}
      title={label}
      onClick={() => {
        const value = dark ? 'light' : 'dark';
        setDark(!dark);
        document.documentElement.dataset.theme = value;
        try {
          localStorage.setItem('ordo.theme', value);
        } catch {
          /* Keep the toggle usable when browser storage is unavailable. */
        }
      }}
    >
      {dark ? (
        <Sun size={18} aria-hidden="true" />
      ) : (
        <Moon size={18} aria-hidden="true" />
      )}
    </button>
  );
}

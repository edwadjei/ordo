'use client';
import { useEffect, useState } from 'react';
type Theme = 'light' | 'dark' | 'system';
export function ThemeSelector() {
  const [theme, setTheme] = useState<Theme>('system');
  useEffect(() => {
    const sync = () => {
      const current = document.documentElement.dataset.theme;
      setTheme(current === 'light' || current === 'dark' ? current : 'system');
    };
    const storage = (event: StorageEvent) => {
      if (event.key !== 'ordo.theme' && event.key !== null) return;
      const value = event.newValue;
      document.documentElement.dataset.theme =
        value === 'light' || value === 'dark' ? value : 'system';
      sync();
    };
    sync();
    window.addEventListener('storage', storage);
    return () => window.removeEventListener('storage', storage);
  }, []);
  return (
    <label className="theme-selector">
      <span className="sr-only">Appearance</span>
      <select
        aria-label="Appearance"
        value={theme}
        onChange={(event) => {
          const value = event.target.value as Theme;
          setTheme(value);
          document.documentElement.dataset.theme = value;
          try {
            localStorage.setItem('ordo.theme', value);
          } catch {
            /* Theme remains usable without storage. */
          }
        }}
      >
        <option value="system">System</option>
        <option value="light">Light</option>
        <option value="dark">Dark</option>
      </select>
    </label>
  );
}

import { useEffect } from 'react';
import { useUIStore } from '@/stores/uiStore';

const themeVariables = {
  light: {
    '--surface-0': '#f8f9fc',
    '--surface-1': '#ffffff',
    '--surface-2': '#f0f1f5',
    '--surface-3': '#e5e7ed',
    '--surface-4': '#d1d5de',
    '--on-surface': '#1a1d2b',
    '--on-surface-secondary': '#6b7194',
    '--border': '#e2e4ec',
    '--border-strong': '#c8ccd8',
  },
  dark: {
    '--surface-0': '#0f1019',
    '--surface-1': '#181924',
    '--surface-2': '#21222f',
    '--surface-3': '#2a2c3a',
    '--surface-4': '#363848',
    '--on-surface': '#e8eaf0',
    '--on-surface-secondary': '#8b8fa8',
    '--border': '#2d2f3e',
    '--border-strong': '#3d3f52',
  },
  midnight: {
    '--surface-0': '#000000',
    '--surface-1': '#0a0a0f',
    '--surface-2': '#141419',
    '--surface-3': '#1e1e25',
    '--surface-4': '#28282f',
    '--on-surface': '#e0e2ea',
    '--on-surface-secondary': '#6e7190',
    '--border': '#1e1e28',
    '--border-strong': '#2e2e3a',
  },
  sepia: {
    '--surface-0': '#f5f0e6',
    '--surface-1': '#faf5eb',
    '--surface-2': '#ece7dd',
    '--surface-3': '#e0dbd1',
    '--surface-4': '#d4cfc5',
    '--on-surface': '#3d3529',
    '--on-surface-secondary': '#7a7060',
    '--border': '#dcd7cd',
    '--border-strong': '#c8c3b9',
  },
};

export function useTheme() {
  const theme = useUIStore(s => s.theme);

  useEffect(() => {
    const root = document.documentElement;
    const vars = themeVariables[theme];

    Object.entries(vars).forEach(([key, value]) => {
      root.style.setProperty(key, value);
    });

    // Set dark class for Tailwind
    if (theme === 'dark' || theme === 'midnight') {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }

    // Update meta theme color
    const metaTheme = document.querySelector('meta[name="theme-color"]');
    if (metaTheme) {
      metaTheme.setAttribute('content', vars['--surface-1']);
    }
  }, [theme]);
}

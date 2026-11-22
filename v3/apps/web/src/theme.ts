// Dark Mode über Tokens (Spec 10): `system | light | dark`, sofort wirksam, bleibt nach Reload erhalten (UI-06).
// Gespeichert in localStorage — reine Darstellungseinstellung, keine Gesundheitsdaten.
export type ThemeChoice = 'system' | 'light' | 'dark';

const KEY = 'stb-theme';

export function storedTheme(): ThemeChoice {
  try {
    const v = localStorage.getItem(KEY);
    return v === 'light' || v === 'dark' || v === 'system' ? v : 'system';
  } catch {
    return 'system';
  }
}

function prefersDark(): boolean {
  return typeof matchMedia === 'function' && matchMedia('(prefers-color-scheme: dark)').matches;
}

export function applyTheme(choice: ThemeChoice): void {
  const dark = choice === 'dark' || (choice === 'system' && prefersDark());
  document.documentElement.classList.toggle('dark', dark);
  document.documentElement.style.colorScheme = dark ? 'dark' : 'light';
}

export function setTheme(choice: ThemeChoice): void {
  try {
    localStorage.setItem(KEY, choice);
  } catch {
    // Privatmodus o. Ä.: gilt dann nur für diese Sitzung.
  }
  applyTheme(choice);
}

/** Beim Start aufrufen; folgt bei `system` Änderungen der Systemeinstellung. */
export function initTheme(): void {
  applyTheme(storedTheme());
  if (typeof matchMedia === 'function') {
    matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
      if (storedTheme() === 'system') applyTheme('system');
    });
  }
}

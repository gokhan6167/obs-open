'use client';
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { EN } from './en';

export type Locale = 'tr' | 'en';

const STORAGE_KEY = 'obs_lang';

interface I18n {
  locale: Locale;
  setLocale: (l: Locale) => void;
  /** Türkçe kaynak metni verir; seçili dil İngilizceyse sözlükteki karşılığını döner. */
  t: (tr: string) => string;
}

const I18nContext = createContext<I18n>({ locale: 'tr', setLocale: () => undefined, t: (s) => s });

export function LocaleProvider({ children }: { children: React.ReactNode }): React.ReactElement {
  const [locale, setLoc] = useState<Locale>('tr');

  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved === 'en' || saved === 'tr') setLoc(saved);
    } catch { /* noop */ }
  }, []);

  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);

  const setLocale = useCallback((l: Locale): void => {
    setLoc(l);
    try { localStorage.setItem(STORAGE_KEY, l); } catch { /* noop */ }
  }, []);

  const value = useMemo<I18n>(
    () => ({ locale, setLocale, t: (tr) => (locale === 'en' ? EN[tr] ?? tr : tr) }),
    [locale, setLocale],
  );
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18n {
  return useContext(I18nContext);
}

/** TR/EN geçiş düğmesi. */
export function LangSwitch({ className, style }: { className?: string; style?: React.CSSProperties }): React.ReactElement {
  const { locale, setLocale } = useI18n();
  const next: Locale = locale === 'en' ? 'tr' : 'en';
  return (
    <button
      type="button"
      className={className}
      style={{ width: 'auto', padding: '0 10px', fontWeight: 600, fontSize: 12.5, ...style }}
      onClick={() => setLocale(next)}
      aria-label={locale === 'en' ? 'Türkçe\'ye geç' : 'Switch to English'}
      title={locale === 'en' ? 'Türkçe' : 'English'}
    >
      {next.toUpperCase()}
    </button>
  );
}

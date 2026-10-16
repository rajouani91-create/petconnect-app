import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { detectBrowserLang, dirOf, isLang, localeOf, setCurrentLang, translate, type Lang, type MessageKey, type Vars } from './index';

const STORAGE_KEY = 'pc-lang';

interface I18nValue {
  lang: Lang;
  locale: string;
  setLang: (lang: Lang) => void;
  t: (key: MessageKey, vars?: Vars) => string;
}

const I18nContext = createContext<I18nValue | null>(null);

function initialLang(): Lang {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (isLang(stored)) return stored;
  } catch {
    /* Speicher nicht verfügbar */
  }
  return detectBrowserLang();
}

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(initialLang);

  setCurrentLang(lang);

  useEffect(() => {
    const html = document.documentElement;
    html.lang = lang;
    html.dir = dirOf(lang);
    try {
      localStorage.setItem(STORAGE_KEY, lang);
    } catch {
      /* Speicher nicht verfügbar */
    }
  }, [lang]);

  const setLang = useCallback((l: Lang) => setLangState(l), []);
  const value = useMemo<I18nValue>(
    () => ({ lang, locale: localeOf(lang), setLang, t: (key, vars) => translate(lang, key, vars) }),
    [lang, setLang],
  );
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nValue {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error('useI18n muss innerhalb von <I18nProvider> verwendet werden.');
  return ctx;
}

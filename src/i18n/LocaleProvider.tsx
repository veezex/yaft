import { createContext, useContext, useEffect, useLayoutEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { dictionaries, formatNumber, isLocale, resolveLocale, translate } from './index.ts';
import type { LanguagePreference, Locale, Text } from './index.ts';

const preferenceKey = 'yaft.language';

function readPreference(): LanguagePreference {
  try {
    const saved = localStorage.getItem(preferenceKey);
    return isLocale(saved) ? saved : 'auto';
  } catch {
    return 'auto';
  }
}

function browserLocale(): Locale {
  return resolveLocale(navigator.languages.length ? navigator.languages : [navigator.language]);
}

function createLocale(locale: Locale) {
  return {
    locale,
    m: dictionaries[locale],
    text: (value: Text) => translate(locale, value),
    number: (value: number, digits?: 0 | 1 | 2) => formatNumber(locale, value, digits),
  };
}

const locales = { en: createLocale('en'), ru: createLocale('ru') };
const LocaleContext = createContext<typeof locales.en>(locales.en);
const PreferenceContext = createContext<{
  preference: LanguagePreference;
  select: (choice: LanguagePreference) => void;
}>({ preference: 'auto', select: () => {} });

export function useLocale() {
  return useContext(LocaleContext);
}

export function LocaleProvider({ children }: { children: ReactNode }) {
  const [preference, setPreference] = useState(readPreference);
  const [browser, setBrowser] = useState(browserLocale);
  const language = locales[preference === 'auto' ? browser : preference];

  useLayoutEffect(() => {
    document.documentElement.lang = language.locale;
    document.title = language.m.workspaceTitle;
  }, [language]);

  useEffect(() => {
    const update = () => setBrowser(browserLocale());
    window.addEventListener('languagechange', update);
    return () => window.removeEventListener('languagechange', update);
  }, []);

  const choice = useMemo(() => ({
    preference,
    select(value: LanguagePreference) {
      setPreference(value);
      try {
        if (value === 'auto') localStorage.removeItem(preferenceKey);
        else localStorage.setItem(preferenceKey, value);
      } catch {
        // The current page can still switch when browser storage is unavailable.
      }
    },
  }), [preference]);

  return <LocaleContext.Provider value={language}>
    <PreferenceContext.Provider value={choice}>{children}</PreferenceContext.Provider>
  </LocaleContext.Provider>;
}

export function LanguageSelect() {
  const { m } = useLocale();
  const { preference, select } = useContext(PreferenceContext);
  return <label className="language-field">
    {m.language}
    <select value={preference} onChange={event => {
      const value = event.target.value;
      if (value === 'auto' || isLocale(value)) select(value);
    }}>
      <option value="auto">{m.browserLanguage}</option>
      <option value="ru" lang="ru">Русский</option>
      <option value="en" lang="en">English</option>
    </select>
  </label>;
}
